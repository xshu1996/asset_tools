const fs = require("fs");
const path = require("path");
const xls = require("excel4node");
const images = require("images");

const [, , dirPath, checkPath, ...comparePath] = process.argv.filter(t => !t.startsWith('-'));
if (!dirPath) throw "missing set product path";

const IGNORE_PATH = getIgnorePath();
const OUTPUT_PATH = getOutputPath();
// 路径需要到 ../laya
const PRODUCT_PATH = path.resolve(dirPath);
const noImg = process.argv.indexOf("-noImg") > -1;

const IMG_PATH_MAP = Object.create(null);
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
        let ret = ignoreParam
            .split(",")
            .filter(ele => !ele)
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
        const nf = path.join(p, f);
        if (fs.statSync(nf).isDirectory())
        {
            walkDir(nf);
        }
        else if (f.endsWith(".ui"))
        {
            const data = fs.readFileSync(nf, { encoding: "utf8" });
            const sf = nf.replace(PRODUCT_PATH, "");
            process.stdout.write("scanning..." + sf + "             \r\n");
            const reg = /"skin(\d{0,})":"([^,]+)"/g;
            // TODO: source: 
            const pageName = path.parse(nf).name;
            if (reg.test(data))
            {
                const imgUrl = RegExp.$2;
                if (!IMG_PATH_MAP[imgUrl])
                {
                    IMG_PATH_MAP[imgUrl] = {};
                }
                if (IMG_PATH_MAP[imgUrl][nf])
                {
                    IMG_PATH_MAP[imgUrl][nf]++;
                }
                else
                {
                    IMG_PATH_MAP[imgUrl][nf] = 1;
                }
            }
        }
    }
}

function _formatSize(size) 
{
    let sign = Math.sign(size);
    size = Math.abs(size);
    return `${size > 1024 ? sign * (size / 1024).toFixed(2) + "KB" : sign * size + "B"}`;
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
        ws.cell(1, 4).string("图片");
        ws.cell(1, 5).string("使用的界面，包含次数");
        ws.cell(1, 6).string("图片大小");

        ws.column(1).setWidth(100);
        ws.column(2).setWidth(16);
        ws.column(3).setWidth(10);
        ws.column(4).setWidth(30);
        ws.column(5).setWidth(100);
        ws.column(6).setWidth(30);

        return ws;
    }

    const ws = initWs();
    const total = Object.keys(target).length;
    console.log("开始构建报表");


    let cursor = 0;
    let row = 1;
    for (let p of Object.keys(target))
    {
        cursor++;
        // TODO: 判断是否属于白名单
        const type = p.endsWith(".ui") ? "UIView" : "Image";
        let prefix = p.endsWith(".ui") ? "pages" : "assets";
        const fullPath = path.resolve(PRODUCT_PATH, `laya/${prefix}`, p);
        if (!fs.existsSync(fullPath))
        {
            MISSING_IMG_MAP[fullPath] = true;
        }
        else
        {
            const d = fs.readFileSync(fullPath, { encoding: "utf8" });
            const sf = fullPath.replace(PRODUCT_PATH, "");
            process.stdout.write(`progress: ${cursor}/${total}, path:${sf}\r\n`);

            row++;
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

            ws.cell(row, 5).string(usedPages);
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
                    if (h > 30)
                    {
                        if (w / h < 0.1)
                        {
                            img.resize(50, 50);
                        } else
                        {
                            img.resize(img.width() * (50 / h));
                        }
                    }
                    SIZE_MAP[p] = Buffer.byteLength(img.toBuffer(ext), "binary");
                    ;
                    ws.cell(row, 6).string(`${_formatSize(+SIZE_MAP[p] || 0)}_${img.width()}x${img.height()}`);
                }
                img && ws.addImage({
                    image: img.toBuffer(ext),
                    type: 'picture',
                    position: {
                        type: 'oneCellAnchor',
                        from: {
                            col: 4,
                            colOff: 0,
                            row,
                            rowOff: 0,
                        },
                    },
                });
            }
        }
    }
    wb.writeToBuffer()
        .then(buffer =>
        {
            console.log("BEGIN EXPORT");
            fs.writeFileSync(path.join(OUTPUT_PATH, 'check_report.xlsx'), buffer);
            console.log("EXPORT FINISHED");
        })
        .catch(err =>
        {
            console.warn(err);
        })
        ;
}


walkDir(PRODUCT_PATH);
// console.log(IMG_PATH_MAP);
console.log("开始构建报表");
makeReport(IMG_PATH_MAP);