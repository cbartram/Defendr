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
    },
    aws: {
        s3: {
            BUCKET_NAME: 'defendr'
        }
    },
    options: {
      // Property to determine if the image should be removed from S3/local to save space after processing is complete
      cleanup: {
          S3: false,
          LOCAL: true,
      }
    }
};

module.exports = {
    config,
    PORT: process.env.PORT || 3000
};
