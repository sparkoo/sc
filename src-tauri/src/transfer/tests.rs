use super::*;
use crate::local::entry_id;
use std::cell::Cell;
use tempfile::tempdir;

#[cfg(windows)]
#[test]
fn retains_ntfs_named_streams() {
    let root = tempdir().unwrap();
    let source = root.path().join("source");
    let dest = root.path().join("dest");
    fs::write(&source, b"data").unwrap();
    fs::write(root.path().join("source:metadata"), b"named data").unwrap();
    transfer(&source, &dest, false, &Observer::new(Decision::Skip)).unwrap();
    assert_eq!(
        fs::read(root.path().join("dest:metadata")).unwrap(),
        b"named data"
    );
}

#[cfg(unix)]
#[test]
fn retains_extended_attributes() {
    let root = tempdir().unwrap();
    let source = root.path().join("source");
    let dest = root.path().join("dest");
    fs::write(&source, b"data").unwrap();
    xattr::set(&source, "user.sc_test", b"metadata").unwrap();
    transfer(&source, &dest, false, &Observer::new(Decision::Skip)).unwrap();
    assert_eq!(
        xattr::get(dest, "user.sc_test").unwrap().unwrap(),
        b"metadata"
    );
}

struct Observer {
    decision: Decision,
    bytes: Cell<u64>,
    interrupt: Option<io::ErrorKind>,
}
impl Observer {
    fn new(decision: Decision) -> Self {
        Self {
            decision,
            bytes: Cell::new(0),
            interrupt: None,
        }
    }
}
impl Feedback for Observer {
    fn check(&self) -> io::Result<()> {
        if self.bytes.get() > 0 {
            if let Some(kind) = self.interrupt {
                return Err(io::Error::from(kind));
            }
        }
        Ok(())
    }
    fn conflict(&self, _: &Path, _: bool) -> io::Result<Decision> {
        Ok(self.decision)
    }
    fn progress(&self, _: &Path, bytes: u64) {
        self.bytes.set(self.bytes.get() + bytes);
    }
    fn record(&self, _: &Path, _: &str) {}
}

#[test]
fn create_rename_and_move_through_public_requests() {
    let root = tempdir().unwrap();
    let observed = Observer::new(Decision::Skip);
    let mut request = Request {
        action: Action::NewFolder,
        sources: vec![],
        directory: entry_id(root.path()),
        name: Some("inbox".into()),
    };
    execute(&request, &observed).unwrap();
    let dest = root.path().join("inbox");
    let source = root.path().join("test.txt");
    fs::write(&source, b"data").unwrap();
    request.action = Action::Rename;
    request.sources = vec![entry_id(&source)];
    request.name = Some("../outside".into());
    assert!(execute(&request, &observed).is_err());
    request.name = Some("named.txt".into());
    execute(&request, &observed).unwrap();
    let renamed = root.path().join("named.txt");
    request.sources = vec![entry_id(&renamed)];
    request.directory = entry_id(&dest);
    request.action = Action::Move;
    execute(&request, &observed).unwrap();
    assert!(!renamed.exists());
    assert_eq!(fs::read(dest.join("named.txt")).unwrap(), b"data");
}

#[test]
fn conflicts_respect_each_choice_and_protect_the_source() {
    let temp = tempdir().unwrap();
    let source = temp.path().join("source");
    let target = temp.path().join("dest.txt");
    fs::write(&source, b"new").unwrap();
    fs::write(&target, b"original").unwrap();
    assert!(!transfer(&source, &target, false, &Observer::new(Decision::Skip)).unwrap());
    assert_eq!(fs::read(&target).unwrap(), b"original");
    transfer(&source, &target, false, &Observer::new(Decision::KeepBoth)).unwrap();
    assert_eq!(fs::read(temp.path().join("dest (2).txt")).unwrap(), b"new");
    transfer(&source, &target, false, &Observer::new(Decision::Replace)).unwrap();
    assert_eq!(fs::read(&target).unwrap(), b"new");
    assert!(transfer(&source, &source, true, &Observer::new(Decision::Replace)).is_err());
    assert_eq!(fs::read(&source).unwrap(), b"new");
}

#[test]
fn partial_move_never_publishes_an_incomplete_file() {
    for failure in [
        io::ErrorKind::Interrupted,
        io::ErrorKind::StorageFull,
        io::ErrorKind::PermissionDenied,
    ] {
        let temp = tempdir().unwrap();
        let source = temp.path().join("source");
        let dest = temp.path().join("existing");
        let payload = vec![42; 700_000];
        fs::write(&source, &payload).unwrap();
        fs::write(&dest, b"original").unwrap();
        let feedback = Observer {
            interrupt: Some(failure),
            ..Observer::new(Decision::Replace)
        };
        let result = transfer_leaf(
            &source,
            &dest,
            &source.metadata().unwrap(),
            true,
            true,
            &feedback,
        );
        assert_eq!(result.unwrap_err().kind(), failure);
        assert_eq!(fs::read(source).unwrap(), payload);
        assert_eq!(fs::read(dest).unwrap(), b"original");
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 2);
    }
}

#[test]
fn merges_directories_and_rejects_recursive_copies() {
    let temp = tempdir().unwrap();
    let src = temp.path().join("src");
    let dst = temp.path().join("dst");
    fs::create_dir(&src).unwrap();
    fs::create_dir(&dst).unwrap();
    fs::write(src.join("kept"), b"ok").unwrap();
    fs::write(dst.join("untouched"), b"keep").unwrap();
    let observer = Observer::new(Decision::Skip);
    assert!(transfer(&src, &src.join("child"), false, &observer).is_err());
    transfer(&src, &dst, true, &observer).unwrap();
    assert!(!src.exists());
    assert_eq!(fs::read(dst.join("kept")).unwrap(), b"ok");
    assert_eq!(fs::read(dst.join("untouched")).unwrap(), b"keep");
}

#[cfg(unix)]
#[test]
fn copies_a_dangling_link_without_following_it() {
    let temp = tempdir().unwrap();
    let src = temp.path().join("link");
    let dst = temp.path().join("copied");
    std::os::unix::fs::symlink("missing", &src).unwrap();
    transfer(&src, &dst, false, &Observer::new(Decision::Skip)).unwrap();
    assert_eq!(fs::read_link(dst).unwrap(), Path::new("missing"));
}

#[cfg(target_os = "linux")]
#[test]
fn moves_across_real_filesystems_with_cancellation() {
    use std::os::unix::fs::MetadataExt;
    let source_dir = tempdir().unwrap();
    let Some(dest_dir) = tempfile::tempdir_in("/dev/shm").ok() else {
        return;
    };
    if source_dir.path().metadata().unwrap().dev() == dest_dir.path().metadata().unwrap().dev() {
        return;
    }
    let source = source_dir.path().join("large");
    let target = dest_dir.path().join("large");
    let payload = vec![7; 1_000_000];
    fs::write(&source, &payload).unwrap();
    let stop = Observer {
        interrupt: Some(io::ErrorKind::Interrupted),
        ..Observer::new(Decision::Skip)
    };
    assert!(transfer(&source, &target, true, &stop).is_err());
    assert_eq!(fs::read(&source).unwrap(), payload);
    assert!(!target.exists());
    transfer(&source, &target, true, &Observer::new(Decision::Skip)).unwrap();
    assert_eq!(fs::read(target).unwrap(), payload);
    assert!(!source.exists());
}
