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
    console.log(`[命令] ${colors.green(`${cmd}`)}`)
}

function printList() {
    let frpcini = getFrpcIni()
    let mappings = []
    let no = 0
    let running = !!fs.pathExistsSync(FRPC_PID_FILE)
    Object.keys(frpcini).sort().forEach((key) => {
        let cfg = frpcini[key]
        if (key != 'common' && cfg.type == 'http') {
            no++
            mappings.push(
                [
                    no,
                    key,
                    `http://localhost:${cfg.local_port} -> http://${cfg.subdomain}.${frpcini.common.server_addr}`,
                    `${running ? colors.green('运行中') : colors.red('未运行')}`,
                ]
            )
        }
    })
    const data = [
        [
            'ID',
            '名称',
            '映射',
            '状态',
        ].map((title) => colors.cyan(colors.bold(title)))
    ]
    mappings.forEach((mapping) => data.push(mapping))
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
    }
}

async function startApp() {
    await preHandle()
    await startDaemon()

    program
        .name(`${colors.rainbow(`[丽丽]内网穿透 v${version}`)}`)
        .usage(' ')
        .version(version, '-v, --version', '版本信息')
        .helpOption('-h, --help', '帮助信息')
        .addHelpCommand(false)

    program
        .command('start')
        .description('开启服务')
        .action(async () => {
            await sendCommand('reload')
            printList()
        })

    program
        .command('stop')
        .description('停止服务')
        .action(async () => {
            await sendCommand('stop')
        })

    program
        .command('list')
        .description('列举映射')
        .alias('l')
        .action(async () => {
            printList()
        })

    program
        .command('add')
        .description('添加映射')
        .action(async () => {
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
        })

    program
        .command('delete')
        .description('删除映射')
        .action(async () => {
            let frpcini = getFrpcIni()
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            })
            try {
                let keyword = await question(rl, '请输入要删除的映射名/ID: ')
                if (frpcini[keyword]) {
                    delete frpcini[keyword]
                } else {
                    let no = 0
                    Object.keys(frpcini).sort().forEach((key) => {
                        let cfg = frpcini[key]
                        if (key != 'common' && cfg.type == 'http') {
                            no++
                            if (no == keyword) {
                                delete frpcini[key]
                            }
                        }
                    })
                }
                setFrpcIni(frpcini)
                console.log(`[映射] ${colors.green('删除成功')}`)
            } catch (err) {
                throw err
            } finally {
                rl.close()
            }
            await sendCommand('reload')
            printList()
        })

    program
        .command('config')
        .description('服务配置')
        .action(async () => {
            let frpcini = getFrpcIni()
            let server_addr
            let server_port
            let token
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            })
            try {
                server_addr = await question(rl, '请输入服务地址: ')
                server_port = await question(rl, '请输入服务端口: ')
                token = await question(rl, '请输入token: ')
                frpcini.common.server_addr = server_addr
                frpcini.common.server_port = server_port
                frpcini.common.token = token
                setFrpcIni(frpcini)
                console.log(`[服务配置] ${colors.green('写入成功')}`)
            } catch (err) {
                throw err
            } finally {
                rl.close()
            }
        })

    program
        .command('log')
        .description('查看日志')
        .action(async () => {
            printLog()
        })

    program
        .command('clear')
        .description('清空日志')
        .action(async () => {
            await fs.writeFile(FRP_LOG, '')
            console.log(`[日志] ${colors.green('已清空')}`)
        })

    program
        .command('ini')
        .description('查看配置')
        .action(async () => {
            printIni()
        })

    program
        .command('daemon')
        .description('查看进程')
        .action(async () => {
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
        })

    program
        .command('flush')
        .description('恢复出厂')
        .action(async () => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            })
            try {
                let confirm = await question(rl, '是否恢复配置为出场设置(y/n)?: ')
                if (confirm == 'y') {
                    let frpcini = {
                        common: {
                            server_addr: '127.0.0.1',
                            server_port: 7000
                        }
                    }
                    setFrpcIni(frpcini)
                    await sendCommand('stop')
                    console.log(`[配置] ${colors.green('已恢复出厂')}`)
                    printIni()
                }
            } catch (err) {
                throw err
            } finally {
                rl.close()
            }
        })

    program
        .command('kill')
        .description('杀掉进程')
        .action(async () => {
            await sendCommand('kill')
        })

    program.parse(process.argv)
}

startApp()