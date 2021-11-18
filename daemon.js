const Koa = require('koa')
const util = require('util')
const fs = require('fs-extra')
const getPort = require('get-port')
const find = require('find-process')
const Router = require('@koa/router')
const { spawn } = require('child_process')

const {
    FRP_BASE,
    FRP_MAIN,
    FRP_EXE,
    FRP_INI,
    FRP_LOG,
    PORT_FILE,
    PID_FILE,
    FRPC_PID_FILE,
} = require('./common')

const app = new Koa()
const router = new Router()

async function logRecord(log) {
    await fs.appendFile(FRP_LOG, log)
}

async function killFrpc() {
    if (proc) {
        proc.kill()
        while (true) {
            let processes = await find('name', 'frpc', true)
            if (processes && processes.length) { } else {
                break
            }
        }
        fs.removeSync(FRPC_PID_FILE)
    }
}

router.get('/kill', async (ctx) => {
    ctx.status = 201
    setTimeout(async () => {
        await killFrpc()
        fs.removeSync(PORT_FILE)
        fs.removeSync(PID_FILE)
        process.kill(0)
    }, 100)
})

let proc
router.get('/reload', async (ctx) => {
    await killFrpc()
    await new Promise((resolve) => {
        proc = spawn(FRP_EXE, ['-c', FRP_INI], { cwd: FRP_MAIN, detached: true })
        proc.stdout.on('data', (data) => {
            let log = data.toString()
            logRecord(log)
            if (log.includes('login to server success')) {
                fs.writeFileSync(FRPC_PID_FILE, `${proc.pid}`)
            }
            resolve()
        })
        proc.stderr.on('data', (data) => {
            let log = data.toString()
            logRecord(log)
        })
        proc.on('exit', (code) => {
            proc = null
            fs.removeSync(FRPC_PID_FILE)
            resolve()
        })
        proc.on('error', (err) => {
            logRecord(util.format(err))
        })
    })
    ctx.status = 204
})

router.get('/status', async (ctx) => {
    ctx.body = {
        status: 'ok'
    }
})

async function daemon() {
    app.use(router.routes())
    app.use(router.allowedMethods())
    await fs.ensureDir(FRP_BASE)
    let port = await getPort()
    app.listen(port, (err) => {
        if (err) {
            fs.removeSync(PORT_FILE)
        } else {
            console.log(`daemon listen on ${port}`)
            fs.writeFileSync(PORT_FILE, `${port}`)
        }
    })
}

daemon()