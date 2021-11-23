
const os = require('os')
const path = require('path')
const { name } = require('./package.json')

const win32 = os.platform() == 'win32'

const FRP_WIN_URL = process.env.FRP_WIN_URL
const FRP_MAC_URL = process.env.FRP_MAC_URL

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
    FRPC_PID_FILE,
    FRP_BASE,
    FRP_MAIN,
    FRP_EXE,
    FRP_INI,
    FRP_LOG,
    PID_FILE,
    PORT_FILE,
}
