use std::{
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use crate::storage::{Entry, Folder, Listing, StorageProvider, Target};
use crate::transfer::{self, Action, Feedback, Request};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

#[cfg(unix)]
use std::os::unix::ffi::{OsStrExt, OsStringExt};
#[cfg(windows)]
use std::os::windows::ffi::{OsStrExt, OsStringExt};

pub fn entry_id(path: &Path) -> String {
    #[cfg(unix)]
    let bytes = path.as_os_str().as_bytes();
    #[cfg(windows)]
    let bytes: Vec<u8> = path
        .as_os_str()
        .encode_wide()
        .flat_map(u16::to_le_bytes)
        .collect();
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn resolve(id: &str) -> io::Result<PathBuf> {
    let invalid = || io::Error::new(io::ErrorKind::InvalidInput, "Invalid entry ID");
    let bytes = URL_SAFE_NO_PAD.decode(id).map_err(|_| invalid())?;
    #[cfg(unix)]
    let native = OsString::from_vec(bytes);
    #[cfg(windows)]
    let native = {
        let (pairs, remainder) = bytes.as_chunks::<2>();
        if !remainder.is_empty() {
            return Err(invalid());
        }
        let units: Vec<_> = pairs.iter().copied().map(u16::from_le_bytes).collect();
        OsString::from_wide(&units)
    };
    let path = PathBuf::from(native);
    if path.is_absolute() {
        Ok(path)
    } else {
        Err(invalid())
    }
}

impl Target {
    fn path(self) -> io::Result<PathBuf> {
        match self {
            Self::Id(id) => resolve(&id),
            Self::Path(path) => {
                let path = PathBuf::from(path);
                if path.is_absolute() {
                    Ok(path)
                } else {
                    Err(io::Error::other("Enter an absolute folder path"))
                }
            }
            Self::Home => {
                dirs::home_dir().ok_or_else(|| io::Error::other("Home folder unavailable"))
            }
        }
    }
}

pub struct LocalStorage;

impl StorageProvider for LocalStorage {
    fn list(&self, target: Target, sink: &mut dyn FnMut(Listing) -> bool) -> io::Result<()> {
        list(target, sink)
    }
    fn open(&self, id: &str) -> io::Result<()> {
        open::that(resolve(id)?)
    }
    fn execute(&self, request: &Request, feedback: &dyn Feedback) -> io::Result<()> {
        transfer::execute(request, feedback)
    }
}

pub fn list(target: Target, mut send: impl FnMut(Listing) -> bool) -> io::Result<()> {
    let path = dunce::canonicalize(target.path()?)?;
    let children = fs::read_dir(&path)?;
    if !send(Listing::Opened(Folder {
        id: entry_id(&path),
        path: path.to_string_lossy().into_owned(),
        parent: path.parent().map(entry_id),
        actions: &[
            Action::Copy,
            Action::Move,
            Action::Rename,
            Action::NewFolder,
            Action::Trash,
        ],
    })) {
        return Ok(());
    }
    let mut skipped = 0;
    let mut entries = Vec::with_capacity(256);
    for child in children {
        let child = match child {
            Ok(item) => item,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let path = child.path();
        let metadata = match child.metadata() {
            Ok(meta) => meta,
            Err(_) => {
                skipped += 1;
                continue;
            }
        };
        let link = metadata.is_symlink();
        let directory = metadata.is_dir() || (link && path.is_dir());
        entries.push(Entry {
            id: entry_id(&path),
            name: child.file_name().to_string_lossy().into_owned(),
            directory,
            link,
            size: if directory { 0 } else { metadata.len() },
            modified: metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|t| t.as_secs()),
        });
        if entries.len() == 256
            && !send(Listing::Entries(std::mem::replace(
                &mut entries,
                Vec::with_capacity(256),
            )))
        {
            return Ok(());
        }
    }
    if !entries.is_empty() {
        send(Listing::Entries(entries));
    }
    send(Listing::Done(skipped));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "creates a 100,000-entry disposable directory"]
    fn large_directory_streams_before_completion() {
        let temp = tempfile::tempdir().unwrap();
        for i in 0..100_000 {
            fs::File::create(temp.path().join(i.to_string())).unwrap();
        }
        let started = std::time::Instant::now();
        let mut count = 0;
        list(Target::Id(entry_id(temp.path())), |message| {
            if let Listing::Entries(entries) = message {
                if count == 0 {
                    println!("Time to first batch: {:?}", started.elapsed());
                    assert!(entries.len() <= 256);
                }
                count += entries.len();
            }
            true
        })
        .unwrap();
        assert_eq!(count, 100_000);
        println!("Complete listing: {:?}", started.elapsed());
    }
    #[test]
    fn lists_real_entries_and_preserves_identity() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("résumé"), b"abc").unwrap();
        let mut files = Vec::new();
        list(Target::Id(entry_id(temp.path())), |message| {
            if let Listing::Entries(batch) = message {
                files.extend(batch);
            }
            true
        })
        .unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].size, 3);
        assert_eq!(fs::read(resolve(&files[0].id).unwrap()).unwrap(), b"abc");
    }

    #[cfg(unix)]
    #[test]
    fn native_ids_preserve_non_utf8_names() {
        let path = PathBuf::from(OsString::from_vec(b"/a\xff".to_vec()));
        assert_eq!(resolve(&entry_id(&path)).unwrap(), path);
    }
}
