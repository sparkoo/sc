use crate::transfer::{self, Action, Decision, Feedback, Request};
use serde::Serialize;
use std::{
    io,
    path::Path,
    sync::{mpsc, Arc, Condvar, Mutex},
    thread,
};
use tauri::State;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conflict {
    token: usize,
    path: String,
    replace: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    id: usize,
    action: Action,
    phase: &'static str,
    current: String,
    bytes: u64,
    records: usize,
    conflict: Option<Conflict>,
    error: Option<String>,
}

struct JobData {
    summary: Summary,
    cancelled: bool,
    decision: Option<Decision>,
    token: usize,
    report: Vec<String>,
}

struct Job {
    data: Mutex<JobData>,
    wake: Condvar,
}

impl Feedback for Job {
    fn check(&self) -> io::Result<()> {
        if self.data.lock().unwrap().cancelled {
            Err(io::Error::other("Cancelled"))
        } else {
            Ok(())
        }
    }
    fn conflict(&self, path: &Path, replace: bool) -> io::Result<Decision> {
        let mut data = self.data.lock().unwrap();
        data.token += 1;
        data.summary.conflict = Some(Conflict {
            token: data.token,
            path: path.display().to_string(),
            replace,
        });
        data.summary.phase = "conflict";
        data = self
            .wake
            .wait_while(data, |d| !d.cancelled && d.decision.is_none())
            .unwrap();
        data.summary.conflict = None;
        data.summary.phase = "running";
        if data.cancelled {
            Err(io::Error::other("Cancelled"))
        } else {
            Ok(data.decision.take().unwrap())
        }
    }
    fn progress(&self, path: &Path, bytes: u64) {
        let mut data = self.data.lock().unwrap();
        if bytes == 0 {
            data.summary.current = path.display().to_string();
        }
        data.summary.bytes += bytes;
    }
    fn record(&self, path: &Path, outcome: &str) {
        let mut data = self.data.lock().unwrap();
        data.report.push(format!("{outcome} · {}", path.display()));
        data.summary.records = data.report.len();
    }
}

pub struct Queue {
    jobs: Mutex<Vec<Arc<Job>>>,
    sender: mpsc::Sender<(Arc<Job>, Request)>,
}

impl Default for Queue {
    fn default() -> Self {
        let (sender, tasks) = mpsc::channel::<(Arc<Job>, Request)>();
        thread::spawn(move || {
            for (job, request) in tasks {
                job.data.lock().unwrap().summary.phase = "running";
                let result = transfer::execute(&request, &*job);
                let mut data = job.data.lock().unwrap();
                match result {
                    Ok(()) => data.summary.phase = "finished",
                    Err(_) if data.cancelled => data.summary.phase = "cancelled",
                    Err(e) => {
                        data.summary.phase = "failed";
                        data.summary.error = Some(e.to_string());
                    }
                }
            }
        });
        Self {
            jobs: Mutex::default(),
            sender,
        }
    }
}

impl Queue {
    fn get(&self, id: usize) -> Result<Arc<Job>, String> {
        self.jobs
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .ok_or_else(|| "Unknown job".into())
    }
    pub fn busy(&self) -> bool {
        self.jobs.lock().unwrap().iter().any(|j| {
            matches!(
                j.data.lock().unwrap().summary.phase,
                "queued" | "running" | "conflict"
            )
        })
    }
}

#[tauri::command]
pub fn start_job(queue: State<Queue>, request: Request) -> Result<usize, String> {
    let mut jobs = queue.jobs.lock().unwrap();
    let id = jobs.len();
    let summary = Summary {
        id,
        action: request.action,
        phase: "queued",
        current: String::new(),
        bytes: 0,
        records: 0,
        conflict: None,
        error: None,
    };
    let job = Arc::new(Job {
        data: Mutex::new(JobData {
            summary,
            cancelled: false,
            decision: None,
            token: 0,
            report: Vec::new(),
        }),
        wake: Condvar::new(),
    });
    queue
        .sender
        .send((Arc::clone(&job), request))
        .map_err(|e| e.to_string())?;
    jobs.push(job);
    Ok(id)
}

#[tauri::command]
pub fn job_list(queue: State<Queue>) -> Vec<Summary> {
    queue
        .jobs
        .lock()
        .unwrap()
        .iter()
        .map(|job| job.data.lock().unwrap().summary.clone())
        .collect()
}

#[tauri::command]
pub fn job_report(queue: State<Queue>, id: usize) -> Result<Vec<String>, String> {
    Ok(queue.get(id)?.data.lock().unwrap().report.clone())
}

#[tauri::command]
pub fn cancel_job(queue: State<Queue>, id: usize) -> Result<(), String> {
    let job = queue.get(id)?;
    job.data.lock().unwrap().cancelled = true;
    job.wake.notify_all();
    Ok(())
}

#[tauri::command]
pub fn answer_conflict(
    queue: State<Queue>,
    id: usize,
    token: usize,
    decision: Decision,
) -> Result<(), String> {
    let job = queue.get(id)?;
    let mut data = job.data.lock().unwrap();
    if !data
        .summary
        .conflict
        .as_ref()
        .is_some_and(|c| c.token == token)
        || data.decision.is_some()
    {
        return Err("This conflict has already been handled".into());
    }
    data.decision = Some(decision);
    job.wake.notify_all();
    Ok(())
}
