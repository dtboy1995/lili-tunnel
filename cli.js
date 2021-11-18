#!/usr/bin/env node

const ini = require('ini')
const fs = require('fs-extra')
const { table } = require('table')
const readline = require('readline')
const download = require('download')
const colors = require('colors/safe')
const { program } = require('commander')
const { version } = require('./package.json')
const ProgressBar = require('progress')
const { spawn } = require('child_process')
const got = require('got').default

const {
    TABLE_CONFIG,
    FRP_BASE,
    FRP_MAIN,
    FRP_EXE,
    FRP_INI,
    FRP_LOG,
    PORT_FILE,
    PID_FILE,
    FRPC_PID_FILE,
} = require('./common')
const path = require('path')

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

async function checkDaemon() {
    if (!await fs.pathExists(PORT_FILE)) {
        console.log('等待daemon启动')
        return false
    } else {
        return true
    }
}

async function sendCommand(cmd) {
    if (!await checkDaemon()) {
        return
    }
    try {
        let port = await fs.readFile(PORT_FILE, 'utf-8')
        await got.get(`http://localhost:${port}/${cmd}`, { timeout: 5 * 1000 })
    } catch (err) { }
    console.log(`[daemon] ${colors.green(`${cmd}`)}`)
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
            '序号',
            '名称',
            '类型',
            '端口',
            '子域',
            '地址',
        ].map((title) => colors.cyan(colors.bold(title)))
    ]
    mappings.forEach((mapping) => data.push(mapping))
    console.log(`[服务状态]: ${fs.pathExistsSync(FRPC_PID_FILE) ? colors.green('已启动') : colors.red('已停止')}`)
    console.log(table(data, TABLE_CONFIG))
}

async function startDaemon() {
    if (!await fs.pathExists(PORT_FILE)) {
        let out = fs.openSync(FRP_LOG, 'a')
        let err = fs.openSync(FRP_LOG, 'a')
        let cp = spawn(process.argv[0], [path.join(__dirname, 'daemon.js')], {
            detached: true,
            stdio: ['ignore', out, err]
        })
        cp.unref()
        fs.writeFileSync(PID_FILE, `${cp.pid}`)
        console.log(`[DAEMON] ${colors.cyan('启动')}`)
    }
}

async function startApp() {
    await preHandle()
    await startDaemon()
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
        .option('--kill', '杀掉daemon')
        .option('--daemon', '查看daemon')
        .version(version, '-v, --version', '版本信息')
        .helpOption('-h, --help', '帮助信息')
    program.parse(process.argv)
    let options = program.opts()
    if (
        !options.start &&
        !options.config &&
        !options.list &&
        !options.add &&
        !options.remove &&
        !options.ini &&
        !options.log &&
        !options.clear &&
        !options.kill &&
        !options.daemon
    ) {
        return program.help()
    }
    if (options.start) {
        await sendCommand('reload')
        printList()
    }
    if (options.config) {
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
    if (options.list) {
        printList()
    }
    if (options.add) {
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
        await sendCommand('reload')
        printList()
    }
    if (options.remove) {
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
        await sendCommand('reload')
        printList()
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
    if (options.kill) {
        await sendCommand('kill')
    }
    if (options.daemon) {
        if (!await checkDaemon()) {
            return
        }
        let port = await fs.readFile(PORT_FILE, 'utf-8')
        let pid = await fs.readFile(PID_FILE, 'utf-8')
        const data = [
            [
                '端口',
                'PID',
            ].map((title) => colors.cyan(colors.bold(title))),
            [
                port,
                pid
            ]
        ]
        console.log(table(data, TABLE_CONFIG))
    }
}

startApp()