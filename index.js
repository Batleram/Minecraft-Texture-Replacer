import { readdir } from "node:fs/promises"
import { rmSync, copyFileSync, mkdirSync, writeFileSync, createWriteStream } from "node:fs"
import Jimp from "jimp"
import cliProgress from "cli-progress"
import archiver from "archiver"

const IN_FOLDER = "./in"
const OUT_FOLDER = "./out"
const IMAGE_FILE = "./mcride.png"
const PACK_NAME = "MC RIDE"

// https://minecraft.fandom.com/wiki/Tutorials/Creating_a_resource_pack#Formatting_pack.mcmeta
const PACK_FORMAT = "1"
const PACK_DESCRIPTION = "MC Ride moment"

function getFilePaths(folder) {
    return new Promise((Resolve, Reject) => {
        readdir(folder, { withFileTypes: true }).then((files) => {
            let out = []
            let promises = []

            for (const file of files) {
                if (file.isDirectory()) {
                    promises.push(getFilePaths(`${folder}/${file.name}`));
                    continue
                }

                out.push(`${folder}/${file.name}`)
            }

            if (promises.length === 0)
                Resolve(out)

            Promise.allSettled(promises).then((promiseResults) => {
                promiseResults.forEach(result => out = out.concat(result.value))
                Resolve(out)
            }).catch(err => { console.error(err); Reject(err) })

        }).catch(err => console.error(err))
    })
}

async function replaceImage(src, dest, desiredJimpImage) {
    try {
        const srcImage = await Jimp.read(src)

        desiredJimpImage.resize(srcImage.bitmap.width, srcImage.bitmap.height).write(dest)
    }
    catch (e) {
        console.error(e)
    }
    advanceProgress()
}

function advanceProgress() {
    fileCount += 1;
    bar.update(fileCount)
}

// init bar 
const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
bar.start(100, 0)

// empty out folder if exists
rmSync(`${OUT_FOLDER}/`, { recursive: true, force: true })

// load info from disk
const ressourcePackFilePaths = await getFilePaths(IN_FOLDER)
const imageContent = await Jimp.read(IMAGE_FILE)

// configure bar for each files
let fileCount = 0
// add 3 for compressing and other general pack files
bar.start(ressourcePackFilePaths.length + 3, 0)

// copy files or replace with image
const promises = []
for (const filePath of ressourcePackFilePaths) {
    const strippedPath = filePath.split(IN_FOLDER)[1]

    // if it's not a png, just copy it
    if (!filePath.endsWith(".png")) {
        mkdirSync(OUT_FOLDER + strippedPath.split("/").slice(0, -1).join("/"), { recursive: true })
        copyFileSync(filePath, OUT_FOLDER + strippedPath)
        advanceProgress()
        continue
    }

    // async replace the image
    promises.push(replaceImage(filePath, OUT_FOLDER + strippedPath, imageContent))
}


// write the mcmeta for the pack
writeFileSync(`${OUT_FOLDER}/pack.mcmeta`, `{\n
  "pack":{\n
	"pack_format": ${PACK_FORMAT},\n
	"description": "${PACK_DESCRIPTION}"\n
  }\n
}\n`)
advanceProgress()

// write the pack icon
imageContent.resize(256, 256).write(`${OUT_FOLDER}/pack.png`)
advanceProgress()

// wait for all the image substitutions to finish before compressing the archive
await Promise.allSettled(promises)

// init zip file
const output = createWriteStream(`./${PACK_NAME}.zip`)
const archive = archiver('zip', { zlib: { level: 9 } })
archive.pipe(output)

// add files to zip
archive.directory(`${OUT_FOLDER}`, false)

// write the zip
archive.finalize()

//done
bar.stop()
