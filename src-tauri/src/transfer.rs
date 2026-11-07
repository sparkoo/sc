use std::{
    ffi::OsString,
    fs::{self, File},
    io,
    path::{Component, Path, PathBuf},
};

use crate::local::resolve;
use serde::{Deserialize, Serialize};
#[cfg(test)]
mod tests;
#[cfg(windows)]
mod windows_copy;
#[cfg(unix)]
use std::io::{Read, Write};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Action {
    Copy,
    Move,
    Rename,
    NewFolder,
    Trash,
}

#[derive(Deserialize)]
pub struct Request {
    pub action: Action,
    pub sources: Vec<String>,
    pub directory: String,
    pub name: Option<String>,
}

#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Decision {
    Skip,
    KeepBoth,
    Replace,
}

pub trait Feedback {
    fn check(&self) -> io::Result<()>;
    fn conflict(&self, path: &Path, replace: bool) -> io::Result<Decision>;
    fn progress(&self, path: &Path, bytes: u64);
    fn record(&self, path: &Path, outcome: &str);
}

fn name_component(name: Option<&str>) -> io::Result<&str> {
    let name = name.unwrap_or_default();
    let mut parts = Path::new(name).components();
    match (parts.next(), parts.next()) {
        (Some(Component::Normal(component)), None) if component == name => Ok(name),
        _ => Err(io::Error::other("Enter a single file or folder name")),
    }
}

fn with_path(e: io::Error, path: &Path) -> io::Error {
    io::Error::new(e.kind(), format!("{}: {e}", path.display()))
}

pub fn execute(request: &Request, feedback: &dyn Feedback) -> io::Result<()> {
    let destination = dunce::canonicalize(resolve(&request.directory)?)?;
    if !destination.is_dir() {
        return Err(io::Error::other("Destination is not a folder"));
    }
    feedback.check()?;
    if request.action == Action::NewFolder {
        let path = destination.join(name_component(request.name.as_deref())?);
        fs::create_dir(&path).map_err(|e| with_path(e, &path))?;
        feedback.record(&path, "Created");
        return Ok(());
    }
    if request.sources.is_empty()
        || (request.action == Action::Rename && request.sources.len() != 1)
    {
        return Err(io::Error::other("Invalid selection"));
    }
    for id in &request.sources {
        feedback.check()?;
        let source = resolve(id)?;
        let name = source
            .file_name()
            .ok_or_else(|| io::Error::other("Select an entry inside a folder"))?;
        feedback.progress(&source, 0);
        match request.action {
            Action::Copy | Action::Move => {
                transfer(
                    &source,
                    &destination.join(name),
                    request.action == Action::Move,
                    feedback,
                )
                .map_err(|e| with_path(e, &source))?;
            }
            Action::Rename => {
                let target = source.with_file_name(name_component(request.name.as_deref())?);
                renamore::rename_exclusive(&source, &target).map_err(|e| with_path(e, &source))?;
                feedback.record(&target, "Renamed");
            }
            Action::Trash => {
                trash::delete(&source)
                    .map_err(|e| io::Error::other(format!("{}: {e}", source.display())))?;
                feedback.record(&source, "Trashed");
            }
            Action::NewFolder => unreachable!(),
        }
    }
    Ok(())
}

fn existing(path: &Path) -> io::Result<Option<fs::Metadata>> {
    match fs::symlink_metadata(path) {
        Ok(meta) => Ok(Some(meta)),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

fn check_reparse_point(_meta: &fs::Metadata) -> io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if _meta.file_attributes() & 0x400 != 0 && !_meta.is_symlink() {
            return Err(io::Error::other("Unsupported reparse point or junction"));
        }
    }
    Ok(())
}

fn spare_name(path: &Path, directory: bool) -> io::Result<PathBuf> {
    let base = if directory {
        path.file_name()
    } else {
        path.file_stem()
    };
    let base = base.ok_or_else(|| io::Error::other("Missing file name"))?;
    for index in 2u64.. {
        let mut name = OsString::from(base);
        name.push(format!(" ({index})"));
        if !directory {
            if let Some(extension) = path.extension() {
                name.push(".");
                name.push(extension);
            }
        }
        let candidate = path.with_file_name(name);
        if existing(&candidate)?.is_none() {
            return Ok(candidate);
        }
    }
    unreachable!()
}

fn transfer(
    source: &Path,
    target: &Path,
    moving: bool,
    feedback: &dyn Feedback,
) -> io::Result<bool> {
    feedback.check()?;
    feedback.progress(source, 0);
    let meta = fs::symlink_metadata(source)?;
    check_reparse_point(&meta)?;
    let mut destination = target.to_owned();
    let mut replace = false;
    let mut merge = false;
    if meta.is_dir() {
        let actual_source = dunce::canonicalize(source)?;
        let parent = dunce::canonicalize(
            target
                .parent()
                .ok_or_else(|| io::Error::other("Missing parent"))?,
        )?;
        if parent.starts_with(&actual_source)
            || same_file::is_same_file(source, target).unwrap_or(false)
        {
            return Err(io::Error::other(
                "A folder cannot be transferred into itself",
            ));
        }
    }
    if let Some(other) = existing(target)? {
        check_reparse_point(&other)?;
        merge = meta.is_dir() && other.is_dir() && !other.is_symlink();
        if !merge {
            let can_replace =
                meta.is_file() && other.is_file() && !same_file::is_same_file(source, target)?;
            match feedback.conflict(target, can_replace)? {
                Decision::Skip => {
                    feedback.record(source, "Skipped");
                    return Ok(false);
                }
                Decision::KeepBoth => destination = spare_name(target, meta.is_dir())?,
                Decision::Replace if can_replace => replace = true,
                Decision::Replace => return Err(io::Error::other("This entry cannot be replaced")),
            }
        }
    }
    feedback.check()?;
    if moving && !merge && !replace {
        match renamore::rename_exclusive(source, &destination) {
            Ok(()) => {
                feedback.record(&destination, "Moved");
                return Ok(true);
            }
            Err(e) if e.kind() == io::ErrorKind::CrossesDevices => {}
            Err(e) => return Err(e),
        }
    }
    if meta.is_dir() {
        if !merge {
            fs::create_dir(&destination)?;
        }
        let mut complete = true;
        for child in fs::read_dir(source)? {
            let child = child?;
            complete &= transfer(
                &child.path(),
                &destination.join(child.file_name()),
                moving,
                feedback,
            )
            .map_err(|e| with_path(e, &child.path()))?;
        }
        if !merge {
            fs::set_permissions(&destination, meta.permissions())?;
        }
        if moving && complete {
            fs::remove_dir(source)?;
        }
        if complete {
            feedback.record(&destination, if moving { "Moved" } else { "Copied" });
        }
        return Ok(complete);
    }
    transfer_leaf(source, &destination, &meta, moving, replace, feedback)?;
    Ok(true)
}

fn transfer_leaf(
    source: &Path,
    destination: &Path,
    meta: &fs::Metadata,
    moving: bool,
    replace: bool,
    feedback: &dyn Feedback,
) -> io::Result<()> {
    let original = if meta.is_symlink() {
        copy_link(source, destination, meta)?;
        None
    } else if meta.is_file() {
        Some(copy_file(source, destination, replace, feedback)?)
    } else {
        return Err(io::Error::other("Unsupported special file"));
    };
    feedback.record(destination, "Copied");
    if moving {
        feedback.check()?;
        if let Some((identity, before)) = original {
            unchanged(source, &identity, &before)?;
        } else if fs::read_link(source)? != fs::read_link(destination)? {
            return Err(io::Error::other("Source link changed during transfer"));
        }
        remove_leaf(source, meta)?;
        feedback.record(source, "Removed source");
    }
    Ok(())
}

fn copy_file(
    source: &Path,
    destination: &Path,
    replace: bool,
    feedback: &dyn Feedback,
) -> io::Result<(same_file::Handle, fs::Metadata)> {
    let input = File::open(source)?;
    let before = input.metadata()?;
    let identity = same_file::Handle::from_file(input.try_clone()?)?;
    let mut builder = tempfile::Builder::new();
    builder.prefix(".sc-transfer-");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        builder.permissions(fs::Permissions::from_mode(0o700));
    }
    let staging = builder.tempdir_in(destination.parent().unwrap())?;
    let stage = staging.path().join("payload");
    #[cfg(windows)]
    windows_copy::copy(source, &stage, feedback)?;
    #[cfg(unix)]
    copy_data(source, &input, &stage, feedback)?;
    unchanged(source, &identity, &before)?;
    feedback.check()?;
    if replace {
        fs::rename(stage, destination)?;
    } else {
        renamore::rename_exclusive(stage, destination)?;
    }
    Ok((identity, before))
}

fn unchanged(source: &Path, identity: &same_file::Handle, before: &fs::Metadata) -> io::Result<()> {
    let after = fs::symlink_metadata(source)?;
    if !after.is_file()
        || before.len() != after.len()
        || before.modified()? != after.modified()?
        || *identity != same_file::Handle::from_path(source)?
    {
        return Err(io::Error::other("Source changed during transfer"));
    }
    Ok(())
}

#[cfg(unix)]
fn copy_data(
    source: &Path,
    mut input: &File,
    stage: &Path,
    feedback: &dyn Feedback,
) -> io::Result<()> {
    use xattr::FileExt;
    let before = input.metadata()?;
    let mut output = File::create_new(stage)?;
    let mut buffer = vec![0; 256 * 1024];
    loop {
        feedback.check()?;
        let count = input.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        output.write_all(&buffer[..count])?;
        feedback.progress(source, count as u64);
    }
    for key in input.list_xattr()? {
        feedback.check()?;
        if let Some(value) = input.get_xattr(&key)? {
            output.set_xattr(&key, &value)?;
        }
    }
    output.set_modified(before.modified()?)?;
    output.set_permissions(before.permissions())?;
    output.sync_all()
}

#[cfg(unix)]
fn copy_link(source: &Path, destination: &Path, _: &fs::Metadata) -> io::Result<()> {
    std::os::unix::fs::symlink(fs::read_link(source)?, destination)
}
#[cfg(windows)]
fn copy_link(source: &Path, destination: &Path, meta: &fs::Metadata) -> io::Result<()> {
    use std::os::windows::fs::{symlink_dir, symlink_file, FileTypeExt};
    let target = fs::read_link(source)?;
    if meta.file_type().is_symlink_dir() {
        symlink_dir(target, destination)
    } else {
        symlink_file(target, destination)
    }
}
fn remove_leaf(path: &Path, _meta: &fs::Metadata) -> io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        if _meta.file_type().is_symlink_dir() {
            return fs::remove_dir(path);
        }
    }
    fs::remove_file(path)
}
