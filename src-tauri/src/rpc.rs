pub use discord_sdk as ds;
use crate::requests::RequestError;
use std::time::Duration;

pub struct Client {
    discord: Option<ds::Discord>,
    pub wheel: ds::wheel::Wheel,
}

async fn disconnect(discord: ds::Discord) -> Result<(), RequestError> {
    tokio::time::timeout(Duration::from_secs(2), discord.disconnect()).await
        .map_err(|_| RequestError::new("timeout", "Timed out closing Discord connection"))
}

impl Client {
    pub async fn update_activity(&self, activity: ds::activity::ActivityBuilder) -> Result<(), RequestError> {
        let discord = self.discord.as_ref()
            .ok_or_else(|| RequestError::new("rpc", "Discord connection is closed"))?;
        discord.update_activity(activity).await
            .map(|_| ())
            .map_err(|error| RequestError::new("rpc", format!("Failed to update activity: {error}")))
    }

    pub async fn disconnect(mut self) -> Result<(), RequestError> {
        if let Some(discord) = self.discord.take() { disconnect(discord).await?; }
        Ok(())
    }
}

impl Drop for Client {
    fn drop(&mut self) {
        // The SDK does not close its I/O tasks on Drop. Cancellation of a
        // connection/update future must explicitly initiate bounded cleanup.
        if let Some(discord) = self.discord.take() {
            tauri::async_runtime::spawn(async move {
                if let Err(error) = disconnect(discord).await { eprintln!("{}", error.message); }
            });
        }
    }
}

pub async fn make_client(app_id: ds::AppId, subs: ds::Subscriptions) -> Result<Client, RequestError> {
    let (wheel, handler) = ds::wheel::Wheel::new(Box::new(|error| { eprintln!("Discord SDK: {error:?}"); }));
    let discord = ds::Discord::new(ds::DiscordApp::PlainId(app_id), subs, Box::new(handler))
        .map_err(|error| RequestError::new("rpc", format!("Unable to create Discord client: {error}")))?;
    let client = Client { discord: Some(discord), wheel };
    let mut user = client.wheel.user();
    user.0.changed().await.map_err(|error| RequestError::new("rpc", error.to_string()))?;
    let error = match &*user.0.borrow() {
        ds::wheel::UserState::Connected(_) => None,
        ds::wheel::UserState::Disconnected(error) => Some(error.to_string()),
    };
    if let Some(error) = error { return Err(RequestError::new("rpc", error)); }
    Ok(client)
}
