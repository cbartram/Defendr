const request = require('request-promise-native');
const moment = require('moment');
const { config } = require('./constants');
const { NEST_ID } = process.env;
const Auth = require('./security/Auth');

class Nest extends Auth {

    constructor() {
        super();
        this.getOAuthToken();
        this.getJwtToken();
    }

    /**
     * Retrieves a list of recent events that the Nest camera detected. It can take two optional params
     * start and end which are unix timestamps in seconds since epoch and represent a window of time to retrieve
     * events for.
     * @param accessToken String OAuth access token
     * @param start integer Unix timestamp in seconds representing the starting period of time to retrieve events for
     * @param end integer Unix timestamp in seconds representing the ending period of time to retrieve events for
     * @returns {Promise<any>}
     */
    async getEvents(accessToken, start = null, end = null) {
        const options = {
            'method': 'GET',
            'url': `${config.urls.NEXUS_HOST}${config.endpoints.EVENTS_ENDPOINT}`,
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
    async getSnapshot(jwt) {
        const options = {
            'method': 'GET',
            'url': `${config.urls.NEXUS_HOST}${config.endpoints.SNAPSHOT_ENDPOINT}${NEST_ID}?crop_type=timeline&width=300`,
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

}