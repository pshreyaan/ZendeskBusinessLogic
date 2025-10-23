## Setup & Installation

1. **Clone the repository:**
   ```sh
   git clone <repo-url>
   cd ZendeskBusinessLogic
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Configure environment:**
   - Update `config/dev.yml`, `config/stg.yml`, and `config/prd.yml` with your Zendesk credentials and any other required values.

## Deploying with Serverless Framework

- **Deploy to AWS (default dev stage):**
  ```sh
  npx serverless deploy
  ```
- **Deploy to a specific stage:**
  ```sh
  npx serverless deploy --stage stg
  npx serverless deploy --stage prd
  ```
- **Remove deployment:**
  ```sh
  npx serverless remove
  ```

## Testing Locally

- **Run the Lambda handler locally:**
  ```sh
  npm run test
  ```
  This will execute `src/lambdas/tests/test-businessHoursProcessor.js` and print the result to the console.

## Project Structure

- `serverless.yml` - Main Serverless Framework configuration
- `src/lambdas/businessHoursProcessor.js` - Main Lambda function
- `src/lambdas/tests/test-businessHoursProcessor.js` - Local test runner for the Lambda
- `config/` - Environment-specific configuration files

## Notes
- Make sure your AWS credentials are configured for deployment.
- The Lambda runtime is set to `nodejs22.x` for modern Node.js support.
- Environment variables for the Lambda are managed via the config files and injected by Serverless Framework.
