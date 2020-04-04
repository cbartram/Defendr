const { NEST_ID } = process.env;

const config = {
    urls: {
        OAUTH_URL: 'https://oauth2.googleapis.com/token',
        JWT_TOKEN_URL: 'https://nestauthproxyservice-pa.googleapis.com/v1/issue_jwt',
        NEXUS_HOST: 'https://nexusapi-us1.dropcam.com'
    },
    endpoints: {
        EVENTS_ENDPOINT: `/cuepoint/${NEST_ID}/2`,
        SNAPSHOT_ENDPOINT: `/event_snapshot/${NEST_ID}/`,
        LATEST_IMAGE_ENDPOINT: `/get_image?width=640&uuid=${NEST_ID}`
    }
};

getOAuthToken(REFRESH_TOKEN, CLIENT_ID).then(({ access_token }) => {
    console.log('[INFO] Got OAuth Access token: ', access_token);
    getJwtToken(API_KEY, access_token).then(({ jwt }) => {
        console.log('[INFO] Retrieved JWT Token: ', jwt);
        getEvents(jwt).then(events => {
            console.log('[INFO] Retrieved: ', events.length, " events");
            let ids = events.map(event => event.id);
            console.log(ids);
            getSnapshot(jwt, ids[0]).then(image => {
                console.log('[INFO] Retrieved snapshot image...');
            });
        });
    });
});

module.exports = {
    config,
    PORT: process.env.PORT || 3000
};
