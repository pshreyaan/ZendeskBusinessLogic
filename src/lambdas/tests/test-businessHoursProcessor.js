const { handler } = require('../businessHoursProcessor');

// Load config for local testing (fallback to .env if config not available)
require('dotenv').config();

// For local testing, we'll still use .env file since serverless config loading is complex
// In actual deployment, the config values will be passed as environment variables by serverless

const event = {};
const context = {
  functionName: 'businessHoursProcessor',
  functionVersion: '1',
  memoryLimitInMB: 128,
  getRemainingTimeInMillis: () => 30000
};

handler(event, context).then(result => {
  console.log('Lambda handler result:', result);
}).catch(err => {
  console.error('Lambda handler error:', err);
});
