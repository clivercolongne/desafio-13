export default {

    filesystem: {
        path: process.env.PWD + '/data'
    },

    mongodb: {
        string: process.env.MONGOSTRING,
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
        }
    }
}  