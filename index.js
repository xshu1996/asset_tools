const fs = require("fs");
const path = require("path");
const xls = require("excel4node");
const images = require("images");

const [, , dirPath, checkPath, ...comparePath] = process.argv.filter(t => !t.startsWith('-'));
if (!dirPath) throw "missing set product path";
// 默认忽略的文件夹
const DEFAULT_IGNORE = [".history", ".vscode", ".laya", ".svn"];
// 路径需要到 ..project_name
const PRODUCT_PATH = path.resolve(dirPath);
console.log(PRODUCT_PATH);
// 忽略检查文件夹
const IGNORE_PATH = getIgnorePath();
console.log(IGNORE_PATH);
// 输出目录 默认为 ./
const OUTPUT_PATH = getOutputPath();
// 是否输出图片到 excel
const noImg = process.argv.indexOf("-noImg") > -1;

const RES_PATH_MAP = Object.create(null);
const UNLESS_RES_MAP = [];
const MISSING_IMG_MAP = Object.create(null);
const SIZE_MAP = Object.create(null);

if (!fs.existsSync(PRODUCT_PATH)) throw "product ptah is not exists";
// if (!checkPath) throw "missing params check path";

function getIgnorePath()
{
    const ignoreIdx = process.argv.findIndex(_ => _ === "-ignore");
    if (ignoreIdx > 0)
    {
        let ignoreParam = process.argv[ignoreIdx + 1];
        console.log(ignoreParam)
        let ret = ignoreParam
            .split(",")
            .filter(ele => ele)
            .reduce((pre, ele) =>
            {
                pre[ele] = true;
                return pre;
            }, {})
            ;
        return ret;
    }
    return {};
}

function getOutputPath()
{
    const outputIdx = process.argv.findIndex(_ => _ === '-out');
    let outPath = './';
    if (outputIdx > 0)
    {
        outPath = process.argv[outputIdx + 1];
        process.argv.splice(outputIdx, 2);
    }
    return outPath;
}

function walkDir(p)
{
    for (const f of fs.readdirSync(p))
    {
        const fullPath = path.join(p, f);
        const selfPath = fullPath.replace(PRODUCT_PATH, "");

        if (IGNORE_PATH && IGNORE_PATH[fullPath])
        {
            continue;
        }

        if (DEFAULT_IGNORE.includes(path.basename(f)))
        {
            continue;
        }

        if (fs.statSync(fullPath).isDirectory())
        {
            if (selfPath == "\\bin") continue;
            walkDir(fullPath);
        }
        else if (f.endsWith(".ui"))
        {
            const data = fs.readFileSync(fullPath, { encoding: "utf8" });
            const sf = fullPath.replace(PRODUCT_PATH, "");
            process.stdout.write("scanning..." + sf + "             \r\n");
            const skinReg = /"skin(\d{0,})":"([^,]+)"/g;
            const srcReg = /("source":)"([^,]+)"/g;
            // TODO: source: 
            const pageName = path.parse(fullPath).name;
            if (skinReg.test(data))
            {
                data.replace(skinReg, function (match, p1, p2)
                {
                    const resUrl = p2;
                    if (f.endsWith("ZhuchengMapInfo.ui"))
                    {
                        console.log(resUrl);
                    }
                    if (!RES_PATH_MAP[resUrl])
                    {
                        RES_PATH_MAP[resUrl] = { totalUsed: 0 };
                    }
                    RES_PATH_MAP[resUrl].totalUsed++;
                    if (RES_PATH_MAP[resUrl][fullPath])
                    {
                        RES_PATH_MAP[resUrl][fullPath]++;
                    }
                    else
                    {
                        RES_PATH_MAP[resUrl][fullPath] = 1;
                    }
                });
            }
            if (srcReg.test(data))
            {

                data.replace(srcReg, function (match, p1, p2)
                {
                    const resUrl = p2;
                    if (!RES_PATH_MAP[resUrl])
                    {
                        RES_PATH_MAP[resUrl] = {};
                    }
                    if (RES_PATH_MAP[resUrl][fullPath])
                    {
                        RES_PATH_MAP[resUrl][fullPath]++;
                    }
                    else
                    {
                        RES_PATH_MAP[resUrl][fullPath] = 1;
                    }
                });
            }
        }
        else if (_isImage(f))
        {
            UNLESS_RES_MAP.push(fullPath.replace(/\\/g, "/"));
        }
    }
}

function _formatSize(size) 
{
    let sign = Math.sign(size);
    size = Math.abs(size);
    return `${size > 1024 ? sign * (size / 1024).toFixed(2) + "KB" : sign * size + "B"}`;
}

function _isImage(file)
{
    return file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".bmp");
}

function makeReport(target)
{
    const wb = new xls.Workbook();
    const options = {
        margins: {
            left: 1.5,
            right: 1.5,
        },
    };

    const initWs = (sheetName) =>
    {
        const ws = wb.addWorksheet(sheetName, options);
        ws.cell(1, 1).string("目标路径");
        ws.cell(1, 2).string("目标类型");
        ws.cell(1, 3).string("使用次数");
        ws.cell(1, 4).string("使用的界面，包含次数");
        ws.cell(1, 5).string("图片大小");
        ws.cell(1, 6).string("图片");

        ws.column(1).setWidth(100);
        ws.column(2).setWidth(16);
        ws.column(3).setWidth(10);
        ws.column(4).setWidth(100);
        ws.column(5).setWidth(30);
        ws.column(6).setWidth(50);

        return ws;
    }

    const imgWs = initWs("Image");
    const viewWs = initWs("UIView");

    const total = Object.keys(target).length;
    console.log("开始构建报表");

    let cursor = 0;
    const bookRow = { imgRow: 1, viewRow: 1, };

    let urls = Object
        .keys(target)
        .sort((a, b) => target[b].totalUsed - target[a].totalUsed)
        ;
    
    for (let p of urls)
    {
        cursor++;
        const type = p.endsWith(".ui") ? "UIView" : "Image";
        let prefix = p.endsWith(".ui") ? "pages" : "assets";
        let ws = p.endsWith(".ui") ? viewWs : imgWs;
        const fullPath = path.resolve(PRODUCT_PATH, `laya/${prefix}`, p);

        let url = fullPath.replace(/\\/g, "/");
        if (UNLESS_RES_MAP.includes(url))
        {
            UNLESS_RES_MAP.splice(UNLESS_RES_MAP.indexOf(url), 1);
        }

        // TODO: 判断是否属于白名单
        if (!fs.existsSync(fullPath))
        {
            MISSING_IMG_MAP[fullPath] = true;
        }
        else
        {
            const sf = fullPath.replace(PRODUCT_PATH, "");
            process.stdout.write(`progress: ${cursor}/${total}, path:${sf}\r\n`);
            let row = p.endsWith(".ui") ? ++bookRow.viewRow : ++bookRow.imgRow;

            ws.cell(row, 1).string(fullPath);
            ws.cell(row, 2).string(type);
            ws.row(row).setHeight(50);
            let usedCnt = 0;
            let usedPages = "";
            for (let k in target[p])
            {
                usedCnt += target[p][k];
                usedPages += `${k.replace(path.join(PRODUCT_PATH, `laya/pages`), "")}| 使用次数：${target[p][k]}\r\n`;
            }
            ws.cell(row, 3).number(usedCnt);
            ws.cell(row, 4).string(usedPages);

            if (!noImg) 
            {
                let img;
                let ext;
                if (type === "Image")
                {
                    img = images(fullPath);
                    ext = path.extname(fullPath);
                    const h = img.height();
                    const w = img.width();
                    if (h > 50)
                    {
                        if (w / h < 0.1)
                        {
                            img.resize(50, 50);
                        } else
                        {
                            img.resize(img.width() * (50 / h));
                        }
                    }
                    // SIZE_MAP[p] = Buffer.byteLength(img.toBuffer(ext), "binary");
                    SIZE_MAP[p] = fs.statSync(fullPath).size;
                    ws.cell(row, 5).string(`${_formatSize(+SIZE_MAP[p] || 0)}_${w}x${h}`);
                }
                img && ws.addImage({
                    image: img.toBuffer(ext),
                    type: 'picture',
                    position: {
                        type: 'oneCellAnchor',
                        from: {
                            col: 6,
                            colOff: 0,
                            row,
                            rowOff: 0,
                        },
                    },
                });
            }
        }
    }

    const unlessImgWs = wb.addWorksheet("UnRefByView", options);
    unlessImgWs.cell(1, 1).string("目标路径");
    unlessImgWs.cell(1, 2).string("图片大小");
    unlessImgWs.cell(1, 3).string("图片");

    unlessImgWs.column(1).setWidth(100);
    unlessImgWs.column(2).setWidth(30);
    unlessImgWs.column(3).setWidth(50);

    let row = 1;
    UNLESS_RES_MAP.sort((a, b) => 
    {
        const getFileSize = function (p)
        {
            let prefix = p.endsWith(".ui") ? "pages" : "assets";
            const fullPath = path.resolve(PRODUCT_PATH, `laya/${prefix}`, p);
            let stats = fs.statSync(fullPath);
            return stats.size;
        };

        return getFileSize(b) - getFileSize(a);
    });
    for (let p of UNLESS_RES_MAP)
    {
        ++row;

        let prefix = p.endsWith(".ui") ? "pages" : "assets";
        const fullPath = path.resolve(PRODUCT_PATH, `laya/${prefix}`, p);

        if (!fs.existsSync(fullPath))
        {
            continue;
        }

        unlessImgWs.cell(row, 1).string(fullPath);
        if (!noImg)
        {
            let ext = path.extname(fullPath);
            let img = images(fullPath);
            const h = img.height();
            const w = img.width();
            if (h > 50)
            {
                if (w / h < 0.1)
                {
                    img.resize(50, 50);
                } else
                {
                    img.resize(img.width() * (50 / h));
                }
            }
            
            SIZE_MAP[p] = fs.statSync(fullPath).size;

            unlessImgWs.cell(row, 2).string(`${_formatSize(+SIZE_MAP[p] || 0)}_${w}x${h}`);
            img && unlessImgWs.addImage({
                image: img.toBuffer(ext),
                type: 'picture',
                position: {
                    type: 'oneCellAnchor',
                    from: { col: 3, colOff: 0, row, rowOff: 0, },
                },
            });
        }
    }

    fs.writeFileSync(path.join(OUTPUT_PATH, "./check_report.json"), JSON.stringify(UNLESS_RES_MAP, null, 4));

    wb.writeToBuffer()
        .then(buffer =>
        {
            console.log("BEGIN EXPORT");
            fs.writeFileSync(path.join(OUTPUT_PATH, "check_report.xlsx"), buffer);
            console.log("EXPORT FINISHED");
        })
        .catch(err =>
        {
            console.warn(err);
        })
        ;
}

function sleep(time)
{
    return new Promise(resolve => setTimeout(resolve, time));
}

async function execute()
{
    console.time("本次输出耗时：");
    walkDir(PRODUCT_PATH);
    await sleep(2000);
    // console.log(IMG_PATH_MAP);
    console.log("开始构建报表");
    makeReport(RES_PATH_MAP);
    console.timeEnd("本次输出耗时：");
}

execute();
// ---- bash
// node .\index.js f:\kou_dai\MainPro -ignore f:\kou_dai\MainPro\laya\assets\res\Unpack,f:\kou_dai\MainPro\laya\assets\res\comp