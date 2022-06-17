const fs = require("fs");
const path = require("path");
const xls = require("excel4node");

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

const ignorePath = getIgnorePath();

function getOutputPath()
{
    const outputIdx = process.argv.findIndex(_ => _ === '-out');
    let outPath = './';
    if (outputIdx > 0)
    {
        outPath = process.argv[outputIdx + 1];
        process.argv.splice(outputIdx, 2);
    }
}