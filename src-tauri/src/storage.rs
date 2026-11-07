use crate::transfer::{Action, Feedback, Request};
use serde::{Deserialize, Serialize};
use std::{io, sync::Arc};

pub type Storage = Arc<dyn StorageProvider>;

/// Browsing and queued commands share the same provider on a local desktop.
pub trait StorageProvider: Send + Sync {
    fn list(&self, target: Target, sink: &mut dyn FnMut(Listing) -> bool) -> io::Result<()>;
    fn open(&self, id: &str) -> io::Result<()>;
    fn execute(&self, request: &Request, feedback: &dyn Feedback) -> io::Result<()>;
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    Id(String),
    Path(String),
    Home,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub path: String,
    pub parent: Option<String>,
    pub actions: &'static [Action],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub directory: bool,
    pub link: bool,
    pub size: u64,
    pub modified: Option<u64>,
}

#[derive(Serialize)]
#[serde(tag = "type", content = "data", rename_all = "camelCase")]
pub enum Listing {
    Opened(Folder),
    Entries(Vec<Entry>),
    Done(usize),
}
