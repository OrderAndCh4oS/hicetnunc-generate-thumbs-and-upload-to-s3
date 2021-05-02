# Usage

Create an S3 bucket and IAM user that has read/write access to the S3 bucket

Copy `.env.example` to `.env` and add the IAM user credentials and bucket to the .env

Run up the API CDK stack (This is a separate repo coming soon) add the api domain to the .env

Populate the `const walletIds = ['tz1XXXXXXXXXXXX'];` with the wallets you want to store objkts of.

Run `node index.js`

# Thanks

- @tarwin hicetnunc collection generator: https://github.com/tarwin/hicetnunc-collection-generator
- @quasimondo scraper: https://gist.github.com/Quasimondo/30416ce22243610a9c95424e8796b008
- all @hicetnunc2000 community
