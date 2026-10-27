use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

const BODY_LIMIT: usize = 16 * 1024 * 1024;

fn fetch(body: Vec<u8>, chunked: bool, status: &str) -> Result<serde_json::Value, RequestError> {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}/catalog", listener.local_addr().unwrap());
    let status = status.to_owned();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        socket.set_write_timeout(Some(Duration::from_secs(5))).unwrap();
        let mut request = Vec::new();
        while !request.ends_with(b"\r\n\r\n") {
            let mut byte = [0];
            socket.read_exact(&mut byte).unwrap();
            request.push(byte[0]);
        }
        let framing = if chunked { "Transfer-Encoding: chunked".to_owned() }
            else { format!("Content-Length: {}", body.len()) };
        write!(socket, "HTTP/1.1 {status}\r\n{framing}\r\nConnection: close\r\n\r\n").unwrap();
        // Oversized responses may be rejected before the server finishes writing.
        for chunk in body.chunks(8192) {
            if chunked && write!(socket, "{:x}\r\n", chunk.len()).is_err() { return; }
            if socket.write_all(chunk).is_err() { return; }
            if chunked && socket.write_all(b"\r\n").is_err() { return; }
        }
        if chunked { let _ = socket.write_all(b"0\r\n\r\n"); }
    });
    let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
    let result = runtime.block_on(fetch_game_catalog(&url, &requests::register().unwrap()));
    server.join().unwrap();
    result
}

#[test]
fn small_unicode_catalog_is_parsed() {
    let catalog = serde_json::json!([{ "id": "123", "name": "日本語 🎮", "executables": [] }]);
    assert_eq!(fetch(serde_json::to_vec(&catalog).unwrap(), false, "200 OK").unwrap(), catalog);
}

#[test]
fn catalog_at_the_body_limit_is_accepted() {
    let catalog = serde_json::json!([{ "id": "123", "name": "Fixture", "executables": [] }]);
    let mut body = serde_json::to_vec(&catalog).unwrap();
    body.resize(BODY_LIMIT, b' ');
    assert_eq!(fetch(body, false, "200 OK").unwrap(), catalog);
}

#[test]
fn oversized_fixed_length_catalog_is_rejected_before_json_parsing() {
    let error = fetch(vec![b' '; BODY_LIMIT + 1], false, "200 OK").unwrap_err();
    assert_eq!(error.code, "too_large");
}

#[test]
fn oversized_chunked_catalog_without_content_length_is_rejected() {
    let error = fetch(vec![b' '; BODY_LIMIT + 1], true, "200 OK").unwrap_err();
    assert_eq!(error.code, "too_large");
}

#[test]
fn malformed_json_and_http_errors_keep_their_error_codes() {
    assert_eq!(fetch(b"{".to_vec(), false, "200 OK").unwrap_err().code, "parse");
    let error = fetch(b"unavailable".to_vec(), false, "503 Service Unavailable").unwrap_err();
    assert_eq!(error.code, "http");
    assert_eq!(error.status, Some(503));
}
