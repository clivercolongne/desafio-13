//Parametros Desafio 12 - imports:
import 'dotenv/config'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { fork } from 'child_process'

//Imports varios de desafios anteriores
import Contenedor from './libs/ContenedorMongo.js'
import DAO from './libs/DAO.js'
import DbConfig from './libs/DbConfig.js'
import fs from 'fs'
import faker from 'faker'
import express from 'express'
import normalizr from 'normalizr'
import {Server} from 'socket.io'

//Sesiones Desafio 10 - imports:
import cookieParser from 'cookie-parser'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import { memoryUsage } from 'process'


//Cluster y fork Desafio 13 - imports:
import os from 'os'
import cluster from 'cluster'

//Obtencion de los argumentos con Yargs
const args = yargs(hideBin(process.argv))
    .default({
        port:8080,
        mode:'CLUSTER'
    })
    .parse()

const PORT = args.port
const MODE = args.mode
const numCPUs = os.cpus().length


const {Router} = express
const router = Router()

const app = express()

const { normalize, denormalize, schema} = normalizr

app.use(express.static('./public'))
app.use(express.json())
app.use(express.urlencoded({extended:true}))

//Sesiones Desafio 10 - configuracion

const advancedOptions = {useNewUrlParser:true, useUnifiedTopology:true}
app.use(cookieParser())

app.use(session({
    store: MongoStore.create({
        mongoUrl: DbConfig.mongodb.string,
        mongoOptions: advancedOptions
    }),
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized:false,
    cookie: {
        maxAge: 60000
    }
}))

const messages = []

//Set template engine
app.set('views', './views')
app.set('view engine', 'ejs')

const libreria = new Contenedor("productos",DAO.mongodb.productSchema)

//****API****:
//Devuelve todos los productos: GET /api/productos
router.get("/", (req, res) => {
    return res.json(libreria.list)
})

//Devuelve un producto segun su ID: GET /api/productos/:id
router.get("/:id", (req, res) => {
    let id = req.params.id
    return res.json(libreria.find(id))
})

//Recibe y agrega un producto y lo devuelve con su ID asignado: POST /api/productos
router.post("/", (req, res) => {
    let obj = req.body
    libreria.insert(obj)
    return res.redirect('/')
})

//Recibe y actualiza un producto segun su id: PUT /api/productos/:id
router.put("/:id", (req, res) => {
    let obj = req.body
    let id = req.params.id
    let put = res.json(libreria.update(id,obj))
    return put
})

//Elimina un producto segun su ID
router.delete("/:id", (req,res) => {
    let id = req.params.id
    let deleted = res.json(libreria.delete(id))
    return(deleted)
})

app.use('/api/productos', router)

//****END API****:

//Desafio 10: Pagina web, manejando estado de la sesion segun el estado del login
app.get('/', (req, res) => {
    if(req.session?.nombre) {
        return res.render('ejs/index', {libreria:libreria, nombre:req.session.nombre})
    }else{
        return res.render('ejs/login')
    }
    
})

app.post('/login', (req, res) => {
    req.session.nombre = req.body.nombre
    res.redirect('/')
})

app.get('/logout', (req, res) => {
    req.session.destroy()
    return res.render('ejs/logout')
})


//Desafio 9: Consigna 1: /api/productos-test
app.get("/api/productos-test", (req, res) => {
    let productos = []
    
    for(let i=0; i<5; i++ ){
        productos.push({
            nombre: faker.commerce.productName(),
            precio: faker.commerce.price(1, 200),
            foto: faker.image.image()
        })
    }
    
    return(res.json(productos))
})

app.get("/productos-test", (req,res) => {
    return res.render('ejs/index-test')
})

//Desafio 12: Agregando /info
app.get("/info", (req,res) => {
    return res.json({
        ArgumentosEntrada: args,
        NombrePlataforma: process.platform,
        VersionNode: process.version,
        MemoriaTotalReservada: memoryUsage().rss, 
        PathEjecucion: process.cwd(),
        ProcessID: process.pid,
        CarpetaProyecto: process.title,
        NumCPUs: numCPUs
    })
})



//Ejecucion en modo Cluster o Fork
if (MODE && MODE == 'CLUSTER' && cluster.isMaster) {
    console.log(`Master ${process.pid} is running on ${PORT}`)

    for(let i=0; i < numCPUs; i++) {
        cluster.fork()
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} died`)
    })
} else {
    
    //Desafio 12: Agregando /api/randoms
    app.get("/api/randoms", (req,res) => {
        const cant = req.query.cant || 100000000
        
        const computo = fork('./libs/randomNumber.js', [cant])

        computo.on("error", (err) => {
            console.log(err)
        })

        computo.on('message', object => {
            return res.json(object)
        })
    })
    
    //Server Listening
    const server = app.listen(process.env.PORT || PORT, () => {
        console.log(`Servidor corriendo en puerto ${PORT}. En modo [${MODE}]`)
    })


    //Chat
    const io = new Server(server)

    io.on("connection", (socket) => {
        let currentTime = new Date().toLocaleTimeString()
        console.log(`${currentTime} New user connected`)

        readChatFromFile()

        socket.emit('messages', messages)

        //Para emitir los mensajes que llegan y sea broadcast
        socket.on("newMessage", data => {
            data.id = messages.length+1
            messages.push(data)
            io.sockets.emit("messages", messages)

            writeChatToFile()
        })

        socket.on("newProduct", data => {
            libreria.insert(data)
            io.sockets.emit("products", data)
        })

    })

    console.log(`Worker ${process.pid} started`)
}



function normalizeAndDenormalize(what, obj) {
    const authorSchema = new schema.Entity("author")
    const chatSchema = new schema.Entity("mensajes", {
        author: authorSchema,
    })

    if(what == "normalize") {
        return normalize(obj, [chatSchema])
    }else{
        return denormalize(obj.result, [chatSchema], obj.entities)
    }
    
}

async function writeChatToFile(){
    try{
        // Normalizamos para guardar la data de esa forma y ahorrar 
        const messagesNormalized = normalizeAndDenormalize("normalize", messages)

        await fs.promises.writeFile('data/chat.json',JSON.stringify(messagesNormalized))

    } catch (err) {
        console.log('no se pudo escribir el archivo ' + err)
    }
}

async function readChatFromFile(){
    try{
        //Leemos la fuente que esta normalizada
        const message = await fs.promises.readFile('data/chat.json')
        const messageList = JSON.parse(message)

        messages.splice(0, messages.length)

        //Denormalizamos la fuente
        const messagesDenormalized = normalizeAndDenormalize("denormalize", messageList)
        
        //La pasamos a la variables messagex
        for (const m of messagesDenormalized) {
            
            messages.push(m)
        }

    } catch (err) {
        console.log('no se pudo leer el archivo ' + err)
    }
}

//Manejador de errores
app.use(function(err,req,res,next){
    console.log(err.stack)
    res.status(500).send('Ocurrio un error: '+err)
})