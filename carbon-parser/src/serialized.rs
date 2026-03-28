use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::Value;

pub fn path<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for key in keys {
        current = current.get(*key)?;
    }
    Some(current)
}

pub fn as_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::Object(map) if map.get("__type")?.as_str()? == "bigint" => {
            map.get("value")?.as_str()?.parse().ok()
        }
        _ => None,
    }
}

pub fn as_i64(value: &Value) -> Option<i64> {
    match value {
        Value::Number(number) => number.as_i64(),
        Value::Object(map) if map.get("__type")?.as_str()? == "bigint" => {
            map.get("value")?.as_str()?.parse().ok()
        }
        _ => None,
    }
}

pub fn as_f64(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => text.parse().ok(),
        _ => None,
    }
}

pub fn as_string(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Object(map) if map.get("__type")?.as_str()? == "date" => {
            Some(map.get("value")?.as_str()?.to_string())
        }
        _ => None,
    }
}

pub fn as_string_vec(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(as_string)
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
}

pub fn decode_buffer(value: &Value) -> Result<Vec<u8>> {
    let map = value
        .as_object()
        .context("buffer wrapper must be an object")?;

    let encoding = map
        .get("encoding")
        .and_then(Value::as_str)
        .context("buffer wrapper missing encoding")?;

    if encoding != "base64" {
        anyhow::bail!("unsupported buffer encoding: {encoding}");
    }

    let data = map
        .get("data")
        .and_then(Value::as_str)
        .context("buffer wrapper missing data")?;

    STANDARD
        .decode(data)
        .with_context(|| "failed to base64 decode buffer wrapper")
}

pub fn decode_pubkey(value: &Value) -> Result<String> {
    let bytes = decode_buffer(value)?;
    Ok(bs58::encode(bytes).into_string())
}

pub fn decode_pubkey_vec(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| decode_pubkey(item).ok())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default()
}
