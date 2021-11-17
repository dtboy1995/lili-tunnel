#!/usr/bin/env node

const os = require('os')
const ini = require('ini')
const path = require('path')
const fs = require('fs-extra')
const { table } = require('table')
const readline = require('readline')
const download = require('download')
const colors = require('colors/safe')
const { program } = require('commander')
const { version, name } = require('./package.json')
const ProgressBar = require('progress')
const { spawn } = require('child_process')

const win32 = os.platform() == 'win32'

const FRP_WIN_URL = 'https://eassistant.oss-cn-beijing.aliyuncs.com/chrome/frp_0.38.0_windows_amd64.zip'
const FRP_MAC_URL = 'https://eassistant.oss-cn-beijing.aliyuncs.com/chrome/frp_0.38.0_darwin_arm64.tar.gz'

const URL = win32 ? FRP_WIN_URL : FRP_MAC_URL
const FRP_BASE = path.join(os.homedir(), `.${name}`)
const FRP_MAIN = path.join(FRP_BASE, path.basename(URL, `${win32 ? '.zip' : '.tar.gz'}`))
const FRP_EXE = path.join(FRP_MAIN, `${win32 ? 'frpc.exe' : 'frpc'}`)
const FRP_INI = path.join(FRP_MAIN, 'frpc.ini')
const FRP_LOG = path.join(FRP_MAIN, 'frpc.log')

const TABLE_CONFIG = {
    columns: [
        { alignment: 'center', verticalAlignment: 'middle' },
        { alignment: 'center', verticalAlignment: 'middle' },
        { alignment: 'center', verticalAlignment: 'middle' },
        { alignment: 'center', verticalAlignment: 'middle' },
        { alignment: 'center', verticalAlignment: 'middle' },
        { alignment: 'center', verticalAlignment: 'middle' }
    ],
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

function getFrpcIni() {
    return ini.parse(fs.readFileSync(FRP_INI, 'utf8'))
}

function setFrpcIni(frpcini) {
    fs.writeFileSync(FRP_INI, ini.stringify(frpcini))
}

function question(rl, message) {
    return new Promise((resolve, reject) => {
        try {
            rl.question(message, (answer) => {
                resolve(answer)
            })
        } catch (err) {
            reject(err)
        }
    })
}

function printIni() {
    console.log(`${colors.yellow('[配置文件]')}`)
    console.log(fs.readFileSync(FRP_INI, 'utf8'))
}


function printLog() {
    console.log(`${colors.yellow('[日志]')}`)
    console.log(fs.readFileSync(FRP_LOG, 'utf8'))
}

async function logRecord(log) {
    await fs.appendFile(FRP_LOG, log)
}

async function preHandle() {
    await fs.ensureDir(FRP_BASE)
    if (!await fs.pathExists(FRP_EXE)) {
        await fs.remove(FRP_MAIN)
        let bar = new ProgressBar(`${colors.yellow('[FRP]')} 下载中 [:bar] :percent`, { total: 100 })
        let current = 0
        await download(URL, FRP_BASE, { extract: true }).on('downloadProgress', ({ percent }) => {
            let p = parseInt(percent * 100)
            bar.tick(p - current)
            current = p
        })
        let frpcini = getFrpcIni()
        Object.keys(frpcini).forEach((key) => {
            if (key != 'common') {
                delete frpcini[key]
            }
        })
        setFrpcIni(frpcini)
    }
}

function printList() {
    let frpcini = getFrpcIni()
    let mappings = []
    let no = 0
    Object.keys(frpcini).forEach((key) => {
        let cfg = frpcini[key]
        if (key != 'common' && cfg.type == 'http') {
            no++
            mappings.push(
                [
                    no,
                    key,
                    cfg.type,
                    colors.yellow(cfg.local_port),
                    colors.green(cfg.subdomain),
                    `http://${cfg.subdomain}.${frpcini.common.server_addr}`
                ]
            )
        }
    })
    const data = [
        [
            colors.cyan(colors.bold('序号')),
            colors.cyan(colors.bold('名称')),
            colors.cyan(colors.bold('类型')),
            colors.cyan(colors.bold('端口')),
            colors.cyan(colors.bold('子域')),
            colors.cyan(colors.bold('地址'))
        ],
    ]
    mappings.forEach((mapping) => data.push(mapping))
    console.log(table(data, TABLE_CONFIG))
}

async function startApp() {
    await preHandle()
    program
        .name(`${colors.rainbow('[丽丽]内网穿透')}`)
        .usage(' ')
        .option('-s, --start', '开启服务')
        .option('-c, --config', '配置服务信息')
        .option('-l, --list', '查看所有映射')
        .option('-a, --add', '添加映射')
        .option('-r, --remove', '移除映射')
        .option('-i, --ini', '查看配置文件')
        .option('--log', '查看日志')
        .option('--clear', '清空日志')
        .version(version, '-v, --version', '版本信息')
        .helpOption('-h, --help', '帮助信息')
    program.parse(process.argv)
    let options = program.opts()
    let { start, config, list, add, remove } = options
    if (!start && !config && !list && !add && !remove && !options.ini && !options.log && !options.clear) {
        return program.help()
    }
    if (start) {
        let proc = spawn(FRP_EXE, ['-c', FRP_INI], { cwd: FRP_MAIN })
        proc.stdout.on('data', (data) => {
            let log = data.toString()
            if (log.includes('login to server success')) {
                console.log(`[服务] ${colors.green('启动成功')}`)
                printList()
            }
            logRecord(log)
        })
        proc.stderr.on('data', (data) => {
            let log = data.toString()
            logRecord(log)
        })
        proc.on('exit', (code) => {
            console.log(`[服务] ${colors.red('启动出错')}`)
            printLog()
        })
        proc.on('error', (err) => {
            console.log(`[服务] ${colors.red('出错')}`, err)
        })
    }
    if (config) {
        let frpcini = getFrpcIni()
        let server_addr
        let server_port
        let token
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })
        try {
            server_addr = await question(rl, '请输入服务端地址: ')
            server_port = await question(rl, '请输入服务端端口: ')
            token = await question(rl, '请输入token: ')
            frpcini.common.server_addr = server_addr
            frpcini.common.server_port = server_port
            frpcini.common.token = token
            setFrpcIni(frpcini)
            console.log(`[服务端配置] ${colors.green('写入成功')}`)
        } catch (err) {
            throw err
        } finally {
            rl.close()
        }
    }
    if (list) {
        printList()
    }
    if (add) {
        let frpcini = getFrpcIni()
        let type = 'http'
        let key
        let local_port
        let subdomain
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })
        try {
            key = await question(rl, '请输入映射名: ')
            local_port = await question(rl, '请输入映射端口: ')
            subdomain = await question(rl, '请输入映射子域: ')
            frpcini[key] = {}
            frpcini[key].type = type
            frpcini[key].local_port = local_port
            frpcini[key].subdomain = subdomain
            setFrpcIni(frpcini)
            console.log(`[映射] ${colors.green('添加成功')}`)
        } catch (err) {
            throw err
        } finally {
            rl.close()
        }
    }
    if (remove) {
        let frpcini = getFrpcIni()
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })
        try {
            let key = await question(rl, '请输入要删除的映射名: ')
            delete frpcini[key]
            setFrpcIni(frpcini)
            console.log(`[映射] ${colors.green('删除成功')}`)
        } catch (err) {
            throw err
        } finally {
            rl.close()
        }
    }
    if (options.ini) {
        printIni()
    }
    if (options.log) {
        printLog()
    }
    if (options.clear) {
        await fs.writeFile(FRP_LOG, '')
        console.log(`[日志] ${colors.green('已清空')}`)
    }
}

startApp()