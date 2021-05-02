# Usage

Create an S3 bucket and IAM user that has read/write access to the S3 bucket

Copy `.env.example` to `.env` and add the IAM user credentials and bucket to the .env

Run up the API CDK stack from https://github.com/OrderAndCh4oS/hicetnunc-api-cdk and add the api domain to the .env

Populate the `const walletIds = ['tz1XXXXXXXXXXXX'];` with the wallets you want to store objkts of.

Run `node index.js`

## Recommended

After you have your images stored in S3 I'd suggest hooking that S3 bucket up to an AWS Serverless Image Handler

https://aws.amazon.com/solutions/implementations/serverless-image-handler/

> The Serverless Image Handler solution provides a highly available serverless architecture that initiates cost-effective image processing in the AWS Cloud. The image handling architecture uses Sharp, the open source image processing software, and is optimized for dynamic image manipulation. This solution uses Amazon CloudFront for global content delivery and Amazon Simple Storage Service (Amazon S3) for reliable and durable cloud storage at a low cost.

## Thanks

- @tarwin hicetnunc collection generator: https://github.com/tarwin/hicetnunc-collection-generator
- @quasimondo scraper: https://gist.github.com/Quasimondo/30416ce22243610a9c95424e8796b008
- all @hicetnunc2000 community
