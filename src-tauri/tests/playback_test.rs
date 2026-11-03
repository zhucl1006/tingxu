use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};
use tingxu_desktop::media::playback::read_range;
#[test]
fn bounded_ranges_suffix_and_invalid_boundaries() {
    let p = std::env::temp_dir().join(format!(
        "tx-range-{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::write(&p, vec![7; 600000]).unwrap();
    let a = read_range(&p, Some("bytes=15-29")).unwrap();
    assert_eq!(
        (a.start, a.end, a.total, a.bytes.len()),
        (15, 29, 600000, 15)
    );
    let b = read_range(&p, Some("bytes=599990-")).unwrap();
    assert_eq!(b.bytes.len(), 10);
    assert_eq!(read_range(&p, Some("bytes=-10")).unwrap().start, 599990);
    assert!(read_range(&p, Some("bytes=600000-")).is_err());
    assert!(read_range(&p, Some("bytes=8-3")).is_err());
    assert!(read_range(&p, Some("bytes=0-1,4-5")).is_err());
    assert!(read_range(&p, None).unwrap().bytes.len() <= 262144);
    fs::remove_file(p).unwrap();
}
