
const os = require('os')
const path = require('path')
const { name } = require('./package.json')

const win32 = os.platform() == 'win32'

const FRP_WIN_URL = 'https://eassistant.oss-cn-beijing.aliyuncs.com/chrome/frp_0.38.0_windows_amd64.zip'
const FRP_MAC_URL = 'https://eassistant.oss-cn-beijing.aliyuncs.com/chrome/frp_0.38.0_darwin_arm64.tar.gz'

const URL = win32 ? FRP_WIN_URL : FRP_MAC_URL
const FRP_BASE = path.join(os.homedir(), `.${name}`)
const FRP_MAIN = path.join(FRP_BASE, path.basename(URL, `${win32 ? '.zip' : '.tar.gz'}`))
const FRP_EXE = path.join(FRP_MAIN, `${win32 ? 'frpc.exe' : 'frpc'}`)
const FRP_INI = path.join(FRP_MAIN, 'frpc.ini')
const FRP_LOG = path.join(FRP_MAIN, 'frpc.log')

const PORT_FILE = path.join(FRP_BASE, 'port')
const PID_FILE = path.join(FRP_BASE, 'pid')
const FRPC_PID_FILE = path.join(FRP_BASE, 'frpcpid')

const TABLE_CONFIG = {
    columns: Array.from(' '.repeat(4)).map(() => {
        return { alignment: 'center', verticalAlignment: 'middle' }
    }),
    border: {
        topBody: `─`,
        topJoin: `┬`,
        topLeft: `┌`,
        topRight: `┐`,
        bottomBody: `─`,
        bottomJoin: `┴`,
        bottomLeft: `└`,
        bottomRight: `┘`,
        bodyLeft: `│`,
        bodyRight: `│`,
        bodyJoin: `│`,
        joinBody: `─`,
        joinLeft: `├`,
        joinRight: `┤`,
        joinJoin: `┼`
    }
}

module.exports = {
    TABLE_CONFIG,
    FRP_BASE,
    FRP_MAIN,
    FRP_EXE,
    FRP_INI,
    FRP_LOG,
    PORT_FILE,
    PID_FILE,
    FRPC_PID_FILE,
}