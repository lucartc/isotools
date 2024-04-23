// Just testing pull request actions

let fs = require('fs/promises')
let iso = require('./index.js')
let file = fs.readFile('./waves.mp4')
let boxes = []

// Basic test case, where the api methods are tested against a file
file
.then(data => {
    boxes = iso.tree(data)
    iso.fix(data,'./out.mp4')
})

console.log('New test version executed!')
