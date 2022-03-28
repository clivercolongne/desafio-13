const object = {}
const cant = +process.argv[2]

console.log(cant)

for (let i = 0; i <= cant ; i++ ) {
    let randomNumber = Math.floor(Math.random() * (1000) + 1 )

    if(!object[randomNumber]){
        object[randomNumber] = 1
    }else{
        object[randomNumber]++
    }
}

process.send(object)
