const { hash } = require('./util');
const fs = require('fs');
const path = require('path');
const request = require('request-promise-native');
const moment = require('moment');

// const CSRF_STATE = hash(process.env.NEST_CLIENT_SECRET + process.hrtime()[0] * 1000000 + process.hrtime()[1] / 1000).replace(/=/g, '');



/**
 * Retrieves a Google OAuth token used to call Nest/Nexus API's and services.
 * @param refreshToken String refresh token used to refresh OAuth token
 * @param clientId String client id
 * @returns {Promise<any>}
 */
const getOAuthToken = async (refreshToken, clientId) => {
    const options = {
        'method': 'POST',
        'url': OAUTH_URL,
        'headers': {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Host': 'oauth2.googleapis.com'
        },
        form: {
            'refresh_token': refreshToken,
            'client_id': clientId,
            'grant_type': 'refresh_token'
        }
    };
    try {
        return JSON.parse(await request(options));
    } catch(e) {
        console.log('[ERROR] Failed to retrieve OAuth token from Nest API: ', e);
    }
};


/**
 * Retrieves a JWT authorization token used to call other Nest/Nexus API's
 * @param apiKey String Google Nest API key
 * @param accessToken String OAuth access token from #getOAuthToken function
 * @returns {Promise<any>}
 */
const getJwtToken = async (apiKey, accessToken) => {
    const options = {
        'method': 'POST',
        'url': JWT_TOKEN_URL,
        'headers': {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Host': 'nestauthproxyservice-pa.googleapis.com',
            'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({"expire_after":"3600s","policy_id":"authproxy-oauth-policy","google_oauth_access_token":accessToken,"embed_google_oauth_access_token":"true"})
    };
    try {
        return JSON.parse(await request(options));
    } catch(e) {
        console.log('[ERROR] Failed to retrieve OAuth token from Nest API: ', e);
    }
};

/**
 * Retrieves a list of recent events that the Nest camera detected. It can take two optional params
 * start and end which are unix timestamps in seconds since epoch and represent a window of time to retrieve
 * events for.
 * @param accessToken String OAuth access token
 * @param start integer Unix timestamp in seconds representing the starting period of time to retrieve events for
 * @param end integer Unix timestamp in seconds representing the ending period of time to retrieve events for
 * @returns {Promise<any>}
 */
const getEvents = async (accessToken, start = null, end = null) => {
    const options = {
        'method': 'GET',
        'url': `${NEXUS_HOST}${EVENTS_ENDPOINT}`,
        'headers': {
            'Authorization': `Basic ${accessToken}`
        }
    };
    try {
        return JSON.parse(await request(options));
    } catch(e) {
        console.log('[ERROR] Failed to retrieve events from the Nest API: ', e)
    }
};

/**
 * Retrieves a single snapshot image and writes it to disk
 * @param jwt String jwt token
 * @param id
 * @returns {Promise<void>}
 */
const getSnapshot = async (jwt, id) => {
    const options = {
        'method': 'GET',
        'url': `${NEXUS_HOST}${SNAPSHOT_ENDPOINT}${id}?crop_type=timeline&width=300`,
        'headers': {
            'Authorization': `Basic ${jwt}`
        }
    };
    console.log('[INFO] Fetching Snapshots for URL: ', options.url);
    try {
        request(options).pipe(fs.createWriteStream(path.join(__dirname, '..', 'assets', moment().format('YYYY-mm-dd_hh:mm:ss.SSS') + '.jpeg'))).on('close', () => {
            console.log('[INFO] Done writing image');
        });
    } catch(e) {
        console.log('[ERROR] Failed to retrieve snapshots from the Nest API: ', e)
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
    // CSRF_STATE,
    getOAuthToken,
    getEvents,
    // AUTHORIZATION_URL: `https://home.nest.com/login/oauth2?client_id=${process.env.NEST_CLIENT_ID}&state=${CSRF_STATE}`,
    PORT: process.env.PORT || 3000
};
