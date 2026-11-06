use super::Feedback;
use std::{ffi::c_void, fs, io, os::windows::ffi::OsStrExt, path::Path, ptr};
use windows_sys::Win32::{
    Foundation::HANDLE,
    Storage::FileSystem::{
        CopyFileExW, COPY_FILE_FAIL_IF_EXISTS, PROGRESS_CANCEL, PROGRESS_CONTINUE,
    },
};

struct Progress<'a> {
    source: &'a Path,
    feedback: &'a dyn Feedback,
    last: u64,
    error: Option<io::Error>,
}

unsafe extern "system" fn on_progress(
    _total: i64,
    copied: i64,
    _stream_size: i64,
    _stream_copied: i64,
    _stream: u32,
    _reason: u32,
    _source: HANDLE,
    _destination: HANDLE,
    data: *const c_void,
) -> u32 {
    // CopyFileExW calls this synchronously while the stack context is alive.
    let state = unsafe { &mut *data.cast_mut().cast::<Progress>() };
    if let Err(error) = state.feedback.check() {
        state.error = Some(error);
        return PROGRESS_CANCEL;
    }
    let copied = copied.max(0) as u64;
    state
        .feedback
        .progress(state.source, copied.saturating_sub(state.last));
    state.last = copied;
    PROGRESS_CONTINUE
}

pub(super) fn copy(source: &Path, target: &Path, feedback: &dyn Feedback) -> io::Result<()> {
    // Verbatim absolute paths preserve long names through the Win32 API.
    let source_wide: Vec<_> = fs::canonicalize(source)?
        .as_os_str()
        .encode_wide()
        .chain([0])
        .collect();
    let target_path = fs::canonicalize(target.parent().unwrap())?.join(target.file_name().unwrap());
    let target_wide: Vec<_> = target_path.as_os_str().encode_wide().chain([0]).collect();
    let mut state = Progress {
        source,
        feedback,
        last: 0,
        error: None,
    };
    // The native copy includes NTFS alternate data streams.
    let ok = unsafe {
        CopyFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            Some(on_progress),
            (&mut state as *mut Progress).cast(),
            ptr::null_mut(),
            COPY_FILE_FAIL_IF_EXISTS,
        )
    };
    if ok == 0 {
        return Err(state.error.unwrap_or_else(io::Error::last_os_error));
    }
    feedback.check()?;
    let original = fs::metadata(target)?.permissions();
    if original.readonly() {
        let mut writable = original.clone();
        #[allow(clippy::permissions_set_readonly_false)] // Windows read-only bit on our staging file.
        writable.set_readonly(false);
        fs::set_permissions(target, writable)?;
    }
    let file = fs::OpenOptions::new().write(true).open(target)?;
    file.sync_all()?;
    if original.readonly() {
        file.set_permissions(original)?;
    }
    Ok(())
}
