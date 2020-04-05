const request = require('request-promise-native');
const moment = require('moment');
const { config } = require('./constants');
const { NEST_ID } = process.env;
const Auth = require('./security/Auth');
const { of, Observable } = require('rxjs');
const { delay, tap, mergeMap, repeat } = require('rxjs/operators');

class Nest extends Auth {

    /**
     * Constructs a new Nest class. This creates an observable which can be polled
     * at a specified interval to retrieve the latest image from the Nest camera.
     * @param subscriptionInterval Integer the interval at which the latest mest image will be published to
     * subscribers.
     */
    constructor(subscriptionInterval = 5000) {
        super();
        this._observable = new Observable(subscriber => {
            setInterval(() => {
                this.getLatestSnapshot().then(data => subscriber.next(data));
            }, subscriptionInterval)
        });

        this._eventsObservable = of({}).pipe(
            mergeMap(_ => this.getEvents()),
            tap((data) => {
                console.log('[INFO] Got data: ', data.length);
            }),
            delay(3000),
            repeat()
        );
    }

    async init() {
        await this.fetchOAuthToken();
        await this.fetchJwtToken(this.accessToken);
        return this;
    }

    subscribeToLatestSnapshot() {
        this._observable.subscribe({
            next(data) {
            }
        });
    }

    subscribeToEvents() {
        console.log('[INFO] Creating Subscription to Events');
        this._eventsObservable.subscribe({
            next(data) {
                console.log('[INFO] Event :', data);
            }
        });
    }

    /**
     * Retrieves a list of recent events that the Nest camera detected. It can take two optional params
     * start and end which are unix timestamps in seconds since epoch and represent a window of time to retrieve
     * events for.
     * @param start integer Unix timestamp in seconds representing the starting period of time to retrieve events for
     * @param end integer Unix timestamp in seconds representing the ending period of time to retrieve events for
     * @returns {Promise<any>}
     */
    getEvents(start = null, end = null) {
        if(!this.jwtToken) {
            throw new Error("Access token is null or undefined call: #fetchAccessToken() to retrieve new OAuth token.");
        }

        const options = {
            'method': 'GET',
            'url': `${config.urls.NEXUS_HOST}${config.endpoints.EVENTS_ENDPOINT}`,
            'headers': {
                'Authorization': `Basic ${this.jwtToken}`
            }
        };
        try {
            return new Promise((res, rej) => {
                request(options)
                    .then(response => res(JSON.parse(response)))
                    .catch(err => rej(err));
            });
        } catch(e) {
            console.log('[ERROR] Failed to retrieve events from the Nest API: ', e)
        }
    };

    async getLatestSnapshot() {
        const options = {
            'method': 'GET',
            'url': `${config.urls.NEXUS_HOST}${config.endpoints.LATEST_IMAGE_ENDPOINT}`,
            'headers': {
                'Authorization': `Basic ${this.jwtToken}`
            }
        };
        try {
            return await request(options);
        } catch(e) {
            console.log('[ERROR] Failed to retrieve snapshots from the Nest API: ', e)
        }
    }

    /**
     * Retrieves a single snapshot image and writes it to disk
     * @param id String image id to retrieve. Will be postfixed with *-labs and prefixed with a unix time
     * stamp in seconds.
     * @returns {Promise<void>}
     */
    async getSnapshot(id) {
        if(!this.getJwtToken()) {
            throw new Error('JWT token is null or undefined. Call #fetchJwtToken() to retrieve new json web token.');
        }
        const options = {
            'method': 'GET',
            'url': `${config.urls.NEXUS_HOST}${config.endpoints.SNAPSHOT_ENDPOINT}${id}?crop_type=timeline&width=300`,
            'headers': {
                'Authorization': `Basic ${this.getJwtToken()}`
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

module.exports = Nest;
