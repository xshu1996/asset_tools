# asset_tools
游戏资源检查、批量操作工具合集。检索界面之间的互相引用，界面的图片、字体...（待扩展）等资源的引用情况。

# 使用方式
安装 ``nodejs version:v14.17.6``， 在脚本目录下执行 ``npm install`` 安装脚本所需依赖包，然后执行 `` node index.js {yourPorjPtah} [-ignore path1,path2] [-noimg] [-out outputPath]`` 参数具体含义与用法参照下面的说明。


# 参数说明

- yourPorjPtah 填入项目根目录，子文件应包含 ``.laya`` 文件
- `` -ignore `` 忽略检索的路径，空格后面跟路径以``,``分隔路径，脚本默认跳过检索 ``".history", ".vscode", ".laya", ".svn"`` 文件夹
- `` -noimg `` 是否输出图片到 excel 文件，如果输出图片而且图片过多，打开 excel 会卡顿
- `` -out `` excel 和 json 文件输出的路径，不填默认当前脚本目录生成报表文件

- example: ``node .\index.js f:\kou_dai\MainPro -ignore f:\kou_dai\MainPro\laya\assets\res\Unpack,f:\kou_dai\MainPro\laya\assets\res\comp ``