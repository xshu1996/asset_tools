const fs = require("fs");
const path = require("path");
const xls = require("excel4node");
const images = require("images");
const { exit } = require("process");

__main__();
async function __main__()
{
    const EFileType = {
        "Unknow": "unknow",
        "UIView": "ui_view",
        "Image": "image",
        "FontFile": "font_file",
    };
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    function getInput(tips = "")
    {
        return new Promise((res, rej) =>
        {
            readline.question(tips, filePath =>
            {
                // readline.close();
                return res(filePath);
            });
        });
    }

    // 是否是可执行文件环境
    const isExe = process.argv0.indexOf("node") === -1;
    if (isExe)
    {
        let param = await getInput("请输入参数:");
        // console.log(param);
        try {
            process.argv = param.split(" ");
            process.argv.unshift(...["_", "_"]);
            // console.log(process.argv);
        }
        catch (err)
        {
            console.log(err, param);
        }
    }
    // 解析输入参数
    const [, , dirPath, checkPath, ...comparePath] = process.argv.filter(t => !t.startsWith('-'));
    if (!dirPath) throw "missing set product path";
    // 默认忽略的文件夹
    const DEFAULT_IGNORE = [".history", ".vscode", ".laya", ".svn"];
    // 路径需要到 ..project_name
    const PRODUCT_PATH = path.resolve(dirPath);
    console.log(PRODUCT_PATH);
    if (!fs.existsSync(PRODUCT_PATH)) throw "product ptah is not exists";
    // if (!checkPath) throw "missing params check path";

    // 忽略检查文件夹
    const IGNORE_PATH = getIgnorePath();
    console.log("IGNORE_PATH: ", IGNORE_PATH);
    // 输出目录 默认为 ./
    const OUTPUT_PATH = getOutputPath();
    // 是否输出图片到 excel
    const noImg = process.argv.indexOf("-noImg") > -1;

    // Map 记录资源使用情况
    const RES_PATH_MAP = Object.create(null);
    const UNLESS_RES_MAP = [];
    const MISSING_IMG_MAP = Object.create(null);
    const SIZE_MAP = Object.create(null);
    const repeatMap = []; // [base64, [path], base64, [path], ...]

    // 获取忽视检索路径
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
    // 获取输出路径，保存报表
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

    // 遍历文件
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
                SIZE_MAP[fullPath] = fs.statSync(fullPath).size;
                process.stdout.write("scanning..." + sf + "             \r\n");

                const pageName = path.parse(fullPath).name;
                // TODO: more source: 
                const skinReg = /"skin(\d{0,})":"([^,]+)"/g;
                const srcReg = /("source":)"([^,]+)"/g;
                const fontReg = /("fontPath":)"([^,]+)"/g;
                const regList = [skinReg, srcReg, fontReg];

                regList
                    .filter(reg => reg.test(data))
                    .map(reg =>
                    {
                        data.replace(reg, function (match, p1, p2)
                        {
                            const resUrl = p2;
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
                        return reg;
                    })
                    ;
            }
            else if (_isImage(f))
            {
                const base64Str = getUrlBase64(fullPath, path.extname(f));
                let index = repeatMap.indexOf(base64Str);
                if (index !== -1)
                {
                    let paths = repeatMap[index + 1];
                    if (!paths.includes(fullPath))
                    {
                        paths.push(fullPath);
                    }
                }
                else
                {
                    repeatMap.push(...[base64Str, [fullPath]]);
                }
                SIZE_MAP[fullPath] = fs.statSync(fullPath).size;
                UNLESS_RES_MAP.push(fullPath);
            }
            else if (f.endsWith(".fnt"))
            {
                SIZE_MAP[fullPath] = fs.statSync(fullPath).size;
                UNLESS_RES_MAP.push(fullPath);
            }
        }
    }

    // 格式化输出大小
    function _formatSize(size) 
    {
        let sign = Math.sign(size);
        size = Math.abs(size);
        return `${size > 1024 ? sign * (size / 1024).toFixed(2) + "KB" : sign * size + "B"}`;
    }

    // 判断是否是图片
    function _isImage(file)
    {
        return file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg") || file.endsWith(".bmp");
    }

    // 构建报表
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
            ws.cell(1, 5).string("文件大小");
            ws.cell(1, 6).string("文件");

            ws.column(1).setWidth(70);
            ws.column(2).setWidth(16);
            ws.column(3).setWidth(10);
            ws.column(4).setWidth(100);
            ws.column(5).setWidth(16);
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
            const type = getFileType(p);
            let prefix = p.endsWith(".ui") ? "pages" : "assets";
            let ws = p.endsWith(".ui") ? viewWs : imgWs;
            const fullPath = path.resolve(PRODUCT_PATH, `laya/${prefix}`, p);

            if (UNLESS_RES_MAP.includes(fullPath))
            {
                UNLESS_RES_MAP.splice(UNLESS_RES_MAP.indexOf(fullPath), 1);
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
                let usedPages = "";
                for (let k in target[p])
                {
                    if (k === "totalUsed") continue;
                    usedPages += `${k.replace(path.join(PRODUCT_PATH, `laya/pages`), "")}| 使用次数：${target[p][k]}\r\n`;
                }

                ws.cell(row, 3).number(target[p].totalUsed || 0);
                ws.cell(row, 4).string(usedPages);
                let str = `${_formatSize(+getFileSize(fullPath))}`;
                if (!noImg) 
                {
                    let img;
                    let ext;
                    if (type === EFileType.Image)
                    {
                        img = images(fullPath);
                        ext = path.extname(fullPath);
                        const h = img.height();
                        const w = img.width();
                        if (h > 50)
                        {
                            (w / h < 0.1) ? img.resize(50, 50) : img.resize(img.width() * (50 / h));
                        }
                        str += `_${w}x${h}`;
                    }
                    img && ws.addImage({
                        image: img.toBuffer(ext),
                        type: 'picture',
                        position: {
                            type: 'oneCellAnchor',
                            from: { col: 6, colOff: 0, row, rowOff: 0 }
                        }
                    });
                }
                ws.cell(row, 5).string(str);
            }
        }

        const unlessImgWs = wb.addWorksheet("UnRefByView", options);
        unlessImgWs.cell(1, 1).string("目标路径");
        unlessImgWs.cell(1, 2).string("文件大小");
        unlessImgWs.cell(1, 3).string("图片");

        unlessImgWs.column(1).setWidth(70);
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
            if (!noImg && getFileType(p) === EFileType.Image)
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

                unlessImgWs.cell(row, 2).string(`${_formatSize(+getFileSize(fullPath))}_${w}x${h}`);
                img && unlessImgWs.addImage({
                    image: img.toBuffer(ext),
                    type: 'picture',
                    position: {
                        type: 'oneCellAnchor',
                        from: { col: 3, colOff: 0, row, rowOff: 0, },
                    },
                });
            }
            else
            {
                unlessImgWs.cell(row, 2).string(`${_formatSize(+getFileSize(fullPath))}`);
            }
        }

        const repeatRecord = wb.addWorksheet("RepeatImage", options);
        repeatRecord.cell(1, 1).string("重复图片路径");
        repeatRecord.column(1).setWidth(100);

        repeatRecord.cell(1, 2).string("重复次数");
        repeatRecord.column(2).setWidth(10);

        repeatRecord.cell(1, 3).string("图片大小");
        repeatRecord.column(3).setWidth(15);

        // [[path]] 二维数组
        repeatMap
            .filter((v, i) => (i & 1) && (v.length > 1))
            .sort((a, b) =>
            {
                if (a.length !== b.length)
                {
                    return b.length - a.length;

                }
                if (getFileSize(a[0]) !== getFileSize(b[0]))
                {
                    return getFileSize(b[0]) - getFileSize(a[0]);
                }
                return 0;
            })
            .forEach((paths, index) =>
            {
                let row = index + 2;
                repeatRecord.cell(row, 1).string(paths.join("\r\n"));
                repeatRecord.cell(row, 2).number(paths.length);
                repeatRecord.cell(row, 3).string(_formatSize(+getFileSize(paths[0])));
            })
            ;

        fs.writeFileSync(path.join(OUTPUT_PATH, "./check_report.json"), JSON.stringify(UNLESS_RES_MAP.map(v => v.replace(/\\/g, "/")), null, 4));

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

    /**
     *
     * @param url 文件绝对路径
     */
    function getUrlBase64(url)
    {
        // const ext = path.extname(url);
        const data = fs.readFileSync(url);
        return Buffer.from(data, "binary").toString("base64");
    }

    // 获取文件类型
    function getFileType(url)
    {
        let ext = path.extname(url);
        let fileType = EFileType.Unknow;
        switch (ext)
        {
            case ".ui":
                fileType = EFileType.UIView;
                break;
            case ".fnt":
                fileType = EFileType.FontFile;
                break;
            case ".png":
            case ".jpg":
            case ".jpeg":
            case ".bmp":
                fileType = EFileType.Image;
                break;
        }
        return fileType;
    }

    // 获取文件大小
    function getFileSize(url)
    {
        if (SIZE_MAP[url]) return SIZE_MAP[url];
        try 
        {
            let size = fs.statSync(url).size;
            SIZE_MAP[url] = size;
            return size;
        }
        catch (err)
        {
            console.error(err);
            return 0;
        }
    }

    function sleep(time)
    {
        return new Promise(resolve => setTimeout(resolve, time));
    }

    // 开始执行
    async function execute()
    {
        console.time("本次输出耗时");
        walkDir(PRODUCT_PATH);
        await sleep(2000);
        // console.log(IMG_PATH_MAP);
        console.log("开始构建报表");
        makeReport(RES_PATH_MAP);
        console.timeEnd("本次输出耗时");
        // console.log(SIZE_MAP);
        await sleep(20000);
        readline.close();
    }
    execute();
}