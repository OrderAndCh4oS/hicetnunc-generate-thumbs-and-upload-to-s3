require('dotenv').config();

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
const AWS_S3_BUCKET_NAME = process.env.AWS_S3_BUCKET
const OBJKTS_API = process.env.OBJKTS_API

if(!AWS_ACCESS_KEY_ID) throw new Error('Missing AWS_ACCESS_KEY_ID environment variable')
if(!AWS_SECRET_ACCESS_KEY) throw new Error('Missing AWS_SECRET_ACCESS_KEY environment variable')
if(!OBJKTS_API) throw new Error('Missing OBJKTS_API environment variable')
if(!AWS_S3_BUCKET_NAME) throw new Error('Missing AWS_S3_BUCKET environment variable')

const cloudFlareUrl = 'https://cloudflare-ipfs.com/ipfs/';
const downloadPath = './downloads';
const srcImagePath = './src-images';
const distPath = './dist';

const browserWidth = 2048;
const browserHeight = 2048;

const sharp = require('sharp');
const fs = require('fs');
const {exec} = require('child_process');
const axios = require('axios');
const puppeteer = require('puppeteer');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
});

const converters = {
    'image/gif': {use: 'sharp', ext: 'gif'},
    'image/png': {use: 'sharp', ext: 'png'},
    'image/jpeg': {use: 'sharp', ext: 'jpg'},
    'image/webp': {use: 'sharp', ext: 'webp'},
    'image/tiff': {use: 'sharp', ext: 'tif'},
    'image/bmp': {use: 'sharp', ext: 'bmp'},
    'video/quicktime': {use: 'ffmpeg', ext: 'mov'},
    'video/mp4': {use: 'ffmpeg', ext: 'mp4'},
    'video/webm': {use: 'ffmpeg', ext: 'webm'},
    'video/ogg': {use: 'ffmpeg', ext: 'ogg'},
    'application/x-directory': {use: 'html', ext: 'html'},
    'model/gltf+json': {use: 'gltf', ext: 'gltf'},
    'model/gltf-binary': {use: 'gltf', ext: 'gltf'},
    'image/svg+xml': {use: 'svg', ext: 'svg'},
    'audio/mpeg': {use: 'audio', ext: 'm4a'},
    'audio/ogg': {use: 'audio', ext: 'ogg'},
    'application/pdf': {use: 'pdf', ext: 'pdf'},
};

const niceExec = async(cmd) => {
    return new Promise((resolve, reject) => {
        exec(cmd, function(error, stdout, stderr) {
            if(error) {
                console.log(`error: ${error.message}`);
                return reject(error);
            }
            if(stdout) console.log(`stdout: ${stdout}`);
            resolve(stdout);
        });
    });
};

const downloadFile = (url, imagePath) => {
    return axios({
        url,
        responseType: 'stream',
        headers: {
            Range: `bytes=0-`,
        },
    }).then(response => {
        return new Promise((resolve, reject) => {
            response.data
                .pipe(fs.createWriteStream(imagePath))
                .on('finish', () => resolve())
                .on('error', e => reject(e));
        });
    });
};

const getImageMetadata = async(file) => {
    return new Promise((resolve, reject) => {
        sharp(file)
            .metadata()
            .then(info => {
                resolve(info);
            })
            .catch((e) => {
                reject(e);
            });
    });
};

const getMaxDimensions = (w, h, maxDim) => {
    if(w <= maxDim && h <= maxDim) {
        w = maxDim;
        h = maxDim;
    } else if(w === h) {
        w = maxDim;
        h = maxDim;
    } else if(w > h) {
        w = maxDim;
        h = h / w * maxDim;
    } else {
        w = w / h * maxDim;
        h = maxDim;
    }
    return {
        width: Math.round(w),
        height: Math.round(h),
    };
};

const resizeImageToMaxSize = async(maxDim, inFile, outFile) => {
    const meta = await getImageMetadata(inFile);
    const dims = getMaxDimensions(meta.width, meta.height, maxDim);
    let options = {};
    if(meta.pages) {
        options.pages = 1;
        options.page = Math.floor(meta.pages / 2);
    }
    await sharp(inFile, options)
        .resize(dims.width, dims.height)
        .toFile(outFile);
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const thumbnailPath = `${distPath}`;
if(!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath);
if(!fs.existsSync(srcImagePath)) fs.mkdirSync(srcImagePath);
if(!fs.existsSync(distPath)) fs.mkdirSync(distPath);

const createThumbnails = async(largeImageFilename, objectId) => {
    const fileName = `${objectId}.png`;
    await resizeImageToMaxSize(
        1024,
        `${srcImagePath}/${largeImageFilename}`,
        `${thumbnailPath}/${fileName}`,
    );
    await uploadToS3(fileName);
};

const createSrcImage = async(filename, objectId) => {
    await resizeImageToMaxSize(
        2048,
        `${downloadPath}/${filename}`,
        `${srcImagePath}/${objectId}.png`,
    );
};

const generateImagesForObjkts = async(objkts) => {
    const browser = await puppeteer.launch({
        defaultViewport: {
            width: browserWidth,
            height: browserHeight,
            isLandscape: true,
        },
        dumpio: true,
        headless: false,
        args: [
            '--hide-scrollbars',
            '--mute-audio',
        ],
    });
    for(const obj of objkts) {
        const tokenId = obj.id;
        const mime = obj.formats?.[0]?.mimeType;
        if(!mime) continue;
        const converter = converters[mime];

        const ipfsUri = obj.artifactUri.substr(7);
        const url = cloudFlareUrl + ipfsUri;

        const filename = `${tokenId}.${converter.ext}`;
        if(converter.use !== 'html') {
            if(!fs.existsSync(`${downloadPath}/${filename}`)) {
                if(converter.use === 'ffmpeg') {
                    await niceExec(
                        `python3 download.py ${ipfsUri} ${downloadPath} ${filename}`);
                } else {
                    await downloadFile(url, `${downloadPath}/${filename}`);
                }
            }
        }

        if(converter) {
            if(fs.existsSync(
                `${thumbnailPath}/${tokenId}.png`)) {
                continue;
            }

            if(converter.use === 'sharp') {
                fs.copyFileSync(`${downloadPath}/${filename}`,
                    `${srcImagePath}/${filename}`);
                await createThumbnails(filename, tokenId);
            } else if(converter.use === 'ffmpeg') {
                if(fs.existsSync(`${srcImagePath}/${tokenId}.png`)) {
                    fs.unlinkSync(`${srcImagePath}/${tokenId}.png`);
                }
                let convertCommand = `ffmpeg -i ${downloadPath}/${filename} -vcodec mjpeg -vframes 1 -an -f rawvideo`;
                convertCommand += ` -ss \`ffmpeg -i ${downloadPath}/${filename} 2>&1 | grep Duration | awk '{print $2}' | tr -d , | awk -F ':' '{print ($3+$2*60+$1*3600)/2}'\``;
                convertCommand += ` ${srcImagePath}/${tokenId}.png`;
                await niceExec(convertCommand);

                await createThumbnails(`${tokenId}.png`, tokenId);
            } else if(converter.use === 'html') {
                if(obj.displayUri) {
                    const displayIpfsUri = obj.displayUri.substr(7);
                    const displayUrl = cloudFlareUrl + displayIpfsUri;
                    await downloadFile(displayUrl, `${downloadPath}/${tokenId}_display`);
                    const meta = await getImageMetadata(
                        `${downloadPath}/${tokenId}_display`);
                    fs.renameSync(`${downloadPath}/${tokenId}_display`,
                        `${downloadPath}/${tokenId}.${meta.format}`);
                    fs.copyFileSync(`${downloadPath}/${tokenId}.${meta.format}`,
                        `${srcImagePath}/${tokenId}.${meta.format}`);
                    await createThumbnails(`${tokenId}.${meta.format}`, tokenId);
                } else {
                    console.log(`ERROR: Missing "displayUri" for ${tokenId}`);
                }
            } else if(converter.use === 'gltf') {
                const url = `http://localhost:5000/${downloadPath}/${tokenId}.gltf`;

                const html = `<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
    <style>
        html, body {
            width: 100%;
            height: 100%;
            padding: 0;
            margin: 0;
        }

        #viewer {
            width: ${browserWidth} px;
            height: ${browserHeight} px;
        }
    </style>
</head>
<body>
<model-viewer id="viewer" src="${url}" auto-rotate></model-viewer>
<script>
    const modelViewerParameters = document.querySelector('model-viewer#viewer');
    modelViewerParameters.addEventListener('model-visibility', (e) => {
        setTimeout(() => {
            const d = document.createElement('div');
            d.setAttribute('id', 'done');
            document.body.appendChild(d);
        }, 1000);
    });
</script>
</body>
</html>`;

                let base64Html = Buffer.from(html).toString('base64');

                const browserPage = await browser.newPage();
                try{
                    await browserPage.goto(`data:text/html;base64,${base64Html}`);
                    await browserPage.waitForSelector('#done');
                    await browserPage.screenshot({path: `${srcImagePath}/${tokenId}.png`, omitBackground: true});
                    await browserPage.close();
                } catch(e) {
                    console.log(e);
                    await browserPage.close();
                    continue;
                }
                await createThumbnails(`${tokenId}.png`, tokenId);
            } else if(converter.use === 'svg') {
                if(obj.displayUri) {
                    const displayIpfsUri = obj.displayUri.substr(7);
                    const displayUrl = cloudFlareUrl + displayIpfsUri;
                    await downloadFile(displayUrl, `${downloadPath}/${tokenId}_display`);
                    const meta = await getImageMetadata(
                        `${downloadPath}/${tokenId}_display`);
                    fs.renameSync(`${downloadPath}/${tokenId}_display`,
                        `${downloadPath}/${tokenId}.${meta.format}`);
                    await createSrcImage(`${tokenId}.${meta.format}`, tokenId);
                } else {
                    const url = `http://localhost:5000/${downloadPath.substr(
                        2)}/${tokenId}.svg`;
                    const meta = await getImageMetadata(`./${downloadPath}/${tokenId}.svg`);
                    const dims = getMaxDimensions(meta.width, meta.height, 2048);

                    const html = `<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        html, body {
            width: 100%;
            height: 100%;
            padding: 0;
            margin: 0;
        }
    </style>
</head>
<body>
<script>
    const myWindow = window.open('${url}', 'svg', 'width=${dims.width}, height=${dims.height}');
    myWindow.resizeTo(${dims.width}, ${dims.height})
    myWindow.focus()
    setTimeout(() => {
        const d = document.createElement('div')
        d.setAttribute('id', 'done')
        document.body.appendChild(d)
    }, 1000)
</script>
</body>
</html>`;

                    let base64Html = Buffer.from(html).toString('base64');

                    const browserPage = await browser.newPage();
                    await browserPage.goto(`data:text/html;base64,${base64Html}`);
                    await browserPage.waitForSelector('#done');

                    let chosenPage = null;
                    for(let page of await browser.pages()) {
                        if(await page.url() === url) {
                            chosenPage = page;
                            break;
                        }
                    }
                    await chosenPage.mouse.move(dims.width / 2, dims.height / 2);
                    await sleep(10);
                    await chosenPage.mouse.move(dims.width / 2 + 1, dims.height / 2 + 1);

                    await chosenPage.screenshot(
                        {path: `./${srcImagePath}/${tokenId}.png`, omitBackground: true});
                    await browserPage.close();
                    await chosenPage.close();
                }
                await createThumbnails(`${tokenId}.png`, tokenId);
            }
        }
    }
    await browser.close();
};

const uploadToS3 = async (fileName) => {
    const fileContent = fs.readFileSync(`${thumbnailPath}/${fileName}`);
    await s3.upload({
        Bucket: AWS_S3_BUCKET_NAME,
        Key: fileName,
        Body: fileContent,
        ACL: "public-read",
        CacheControl: "public, max-age=604800, immutable",
        ContentType: "image/png",
    }).promise();
};

const isFileInS3 = async (fileName) => {
    try {
        await s3.headObject({
            Bucket: AWS_S3_BUCKET_NAME,
            Key: fileName,
        }).promise();
        return true;
    } catch(e) {
        return false;
    }
};

const walletIds = ['tz1VgpmwW66LCbskjudK54Zp96vKn2cHjpGN'];

(async() => {
    let objkts = [];
    for(const walletId of walletIds) {
        const creationsResponse = await axios.get(`${OBJKTS_API}/creations/${walletId}`);
        const creations = await creationsResponse.data;
        for(const objkt of creations) {
            const objktResponse = await axios.get(`${OBJKTS_API}/objkts/${objkt.objectId}`);
            const fileExists = await isFileInS3(`${objktResponse.data.id}.png`);
            if(!fileExists) objkts.push(objktResponse.data);
        }
        const collectionsResponse = await axios.get(`${OBJKTS_API}/collections/${walletId}`);
        const collections = await collectionsResponse.data;
        for(const objkt of collections) {
            const objktResponse = await axios.get(`${OBJKTS_API}/objkts/${objkt.piece}`);
            const fileExists = await isFileInS3(`${objktResponse.data.id}.png`);
            if(!fileExists) objkts.push(objktResponse.data);
        }
    }
    try {
        await generateImagesForObjkts(objkts);
    } catch(e) {
        console.log(e);
    }
})();
