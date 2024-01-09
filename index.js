let fs = require('fs/promises')
let boxes = require('./boxes.js')

function fix(data,output){
    fs
    .open(output,'w+')
    .then(handler => {
        let tree = boxes.tree(data)
        tree.forEach(item => {
            handler.writeFile(data.subarray(item.offset,item.offset+item.size))
        })
    })
}

module.exports = {
    fix:  fix,
    tree: boxes.tree
}