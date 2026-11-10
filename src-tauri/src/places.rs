//! Native quick-select locations. Display text is never used as a navigation identity.
use crate::local::entry_id;
use serde::Serialize;
use std::{io, path::PathBuf};

#[derive(Serialize)]
pub struct Place {
    id: String,
    name: String,
    path: String,
}

fn place(path: PathBuf, name: String) -> Place {
    Place {
        id: entry_id(&path),
        name,
        path: path.to_string_lossy().into_owned(),
    }
}

pub fn list() -> io::Result<Vec<Place>> {
    let mut places = Vec::new();
    if let Some(home) = dirs::home_dir() {
        places.push(place(home, "Home".into()));
    }
    #[cfg(unix)]
    places.push(place(
        PathBuf::from("/"),
        if cfg!(target_os = "macos") {
            "Startup disk"
        } else {
            "Filesystem"
        }
        .into(),
    ));
    let mut volumes = volumes()?;
    volumes.sort_by(|a, b| a.path.cmp(&b.path));
    for volume in volumes {
        if !places.iter().any(|p| p.id == volume.id) {
            places.push(volume);
        }
    }
    Ok(places)
}

#[cfg(windows)]
fn volumes() -> io::Result<Vec<Place>> {
    use windows_sys::Win32::Storage::FileSystem::GetLogicalDrives;
    // Enumerate assigned drive letters before resolving optional display labels.
    let mask = unsafe { GetLogicalDrives() };
    if mask == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok((0..26)
        .filter(|i| mask & (1 << i) != 0)
        .map(|i| {
            let path = format!("{}:\\", char::from(b'A' + i));
            let label = windows_volume_label(&path);
            let name = if label.is_empty() {
                path.clone()
            } else {
                format!("{}: — {label}", char::from(b'A' + i))
            };
            place(PathBuf::from(&path), name)
        })
        .collect())
}

#[cfg(windows)]
fn windows_volume_label(path: &str) -> String {
    use std::{os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Storage::FileSystem::GetVolumeInformationW,
        System::Diagnostics::Debug::{
            GetThreadErrorMode, SetThreadErrorMode, SEM_FAILCRITICALERRORS,
        },
    };
    let root: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(Some(0))
        .collect();
    let mut label = [0u16; 261];
    // An empty removable drive must never open an OS "insert disk" dialog.
    let old_mode = unsafe { GetThreadErrorMode() };
    if unsafe { SetThreadErrorMode(old_mode | SEM_FAILCRITICALERRORS, ptr::null_mut()) } == 0 {
        return String::new();
    }
    let success = unsafe {
        GetVolumeInformationW(
            root.as_ptr(),
            label.as_mut_ptr(),
            label.len() as u32,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            0,
        )
    };
    unsafe {
        SetThreadErrorMode(old_mode, ptr::null_mut());
    }
    if success == 0 {
        return String::new();
    }
    let end = label
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(label.len());
    String::from_utf16_lossy(&label[..end])
}

#[cfg(target_os = "linux")]
fn volumes() -> io::Result<Vec<Place>> {
    Ok(linux_volumes(&std::fs::read("/proc/self/mountinfo")?))
}

#[cfg(any(target_os = "linux", test))]
fn linux_volumes(data: &[u8]) -> Vec<Place> {
    data.split(|b| *b == b'\n')
        .filter_map(|line| {
            let fields: Vec<_> = line.split(|b| *b == b' ').collect();
            let separator = fields.iter().position(|f| *f == b"-")?;
            if separator < 6 || fields.len() < separator + 3 {
                return None;
            }
            let mount = unescape_mount(fields[4]);
            let source = unescape_mount(fields[separator + 2]);
            let kind = fields[separator + 1];
            let network = [
                b"nfs".as_slice(),
                b"nfs4",
                b"cifs",
                b"smb3",
                b"fuse.sshfs",
                b"sshfs",
                b"9p",
            ]
            .contains(&kind);
            // Include data volumes and network shares, excluding OS implementation mounts.
            let hidden = [
                b"/proc".as_slice(),
                b"/sys",
                b"/dev",
                b"/boot",
                b"/etc",
                b"/var",
                b"/usr",
                b"/snap",
                b"/run",
                b"/tmp",
            ]
            .iter()
            .any(|prefix| {
                mount == *prefix
                    || (mount.starts_with(prefix) && mount.get(prefix.len()) == Some(&b'/'))
            });
            let removable = [b"/media/".as_slice(), b"/mnt/", b"/run/media/"]
                .iter()
                .any(|prefix| mount.starts_with(prefix));
            if mount == b"/"
                || (!removable && hidden)
                || !(source.starts_with(b"/dev/") || network || removable)
            {
                return None;
            }
            #[cfg(unix)]
            let path = {
                use std::os::unix::ffi::OsStringExt;
                PathBuf::from(std::ffi::OsString::from_vec(mount))
            };
            #[cfg(not(unix))]
            let path = PathBuf::from(String::from_utf8_lossy(&mount).as_ref());
            let name = path.file_name()?.to_string_lossy().into_owned();
            Some(place(path, name))
        })
        .collect()
}

#[cfg(any(target_os = "linux", test))]
fn unescape_mount(input: &[u8]) -> Vec<u8> {
    let mut result = Vec::new();
    let mut i = 0;
    while i < input.len() {
        if input[i] == b'\\'
            && i + 3 < input.len()
            && input[i + 1..i + 4]
                .iter()
                .all(|b| (b'0'..=b'7').contains(b))
        {
            let value = (input[i + 1] - b'0') as u16 * 64
                + (input[i + 2] - b'0') as u16 * 8
                + (input[i + 3] - b'0') as u16;
            if value <= 255 {
                result.push(value as u8);
                i += 4;
                continue;
            }
        }
        result.push(input[i]);
        i += 1;
    }
    result
}

#[cfg(target_os = "macos")]
fn volumes() -> io::Result<Vec<Place>> {
    use std::{
        ffi::{CStr, OsString},
        os::unix::ffi::OsStringExt,
    };
    // Own the buffer: getmntinfo's shared static buffer is unsafe across concurrent calls.
    let count = unsafe { libc::getfsstat(std::ptr::null_mut(), 0, libc::MNT_NOWAIT) };
    if count < 0 {
        return Err(io::Error::last_os_error());
    }
    let mut mounts: Vec<libc::statfs> = vec![unsafe { std::mem::zeroed() }; count as usize + 16];
    let count = unsafe {
        libc::getfsstat(
            mounts.as_mut_ptr(),
            std::mem::size_of_val(mounts.as_slice()) as i32,
            libc::MNT_NOWAIT,
        )
    };
    if count < 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(mounts
        .iter()
        .take(count as usize)
        .filter_map(|mount| {
            let bytes = unsafe { CStr::from_ptr(mount.f_mntonname.as_ptr()) }.to_bytes();
            let path = PathBuf::from(OsString::from_vec(bytes.to_vec()));
            if !path.starts_with("/Volumes") || path == std::path::Path::new("/Volumes") {
                return None;
            }
            let name = path.file_name()?.to_string_lossy().into_owned();
            Some(place(path, name))
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_places_have_unique_absolute_ids_and_home() {
        let places = list().unwrap();
        let home = dirs::home_dir().unwrap();
        assert!(places
            .iter()
            .any(|p| p.name == "Home" && p.id == entry_id(&home)));
        let mut ids = std::collections::HashSet::new();
        for p in places {
            assert!(crate::local::resolve(&p.id).unwrap().is_absolute());
            assert!(ids.insert(p.id));
        }
    }
    #[test]
    fn mountinfo_filters_system_mounts_and_decodes_names() {
        let data = br"1 0 8:1 / / rw - ext4 /dev/sda1 rw
2 1 0:1 / /proc rw - proc proc rw
3 1 8:2 / /boot/efi rw - vfat /dev/sda2 rw
4 1 8:3 / /media/user/My\040Disk rw shared:1 - exfat /dev/sdb1 rw
5 1 0:2 / /mnt/share rw - cifs //server/share rw
6 1 0:3 / /run/media/user/USB rw - fuse volume rw
7 1 8:4 / /var/lib/data rw - ext4 /dev/sdc1 rw
malformed
";
        let places = linux_volumes(data);
        assert_eq!(
            places.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(),
            ["My Disk", "share", "USB"]
        );
        assert_eq!(unescape_mount(br"/mnt/a\134b\011c"), b"/mnt/a\\b\tc");
    }
}
