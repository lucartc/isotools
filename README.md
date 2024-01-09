# ISO tools
This lib implements part of `ISO/IEC 14496-12 2015`, which is the specification for ISO Base Media File Format, a media container used my many file formats, including mp4.

## Functionalities
With this library you can:
### Fix your media file:
it removes useless bytes from the file

To fix your file, read it and use it with `iso.fix(file_buffer,output_path)` function, sending both the file and the output file where the fixed file should be saved as parameters:

```javascript
let fs = require('fs/promises')
let iso = require('isoinspector')

fs
.readFile('path-to-your-file')
.then(data => {
    iso.fix(data,'path-to-save-fixed-file')
})
```

If the tree's sum of box sizes is less that the size of the original file, it may be a sign that your file is broken. If you face problems when playing the media, try to fix it so that the extra bytes may be removed.

If your file works normally, then the "extra" bytes may just be old boxes that aren't referenced anymore. If you want to reduce the size of the file, using `iso.fix(file,output_path)` may help you in this case.

### Inspect your file:
It generates an array containing the tree of boxes that compose your media file. The tree is a list of JSON objects, where each object is a box. Each box may contain other boxes inside. To access contained boxes, use the property `children`:

```javascript
let fs = require('fs/promises')
let iso = require('isoinspector')

fs
.readFile('path-to-your-file')
.then(data => {
    let boxes = iso.tree(data)
    let tenth_children = boxes[10].children
    console.log('These are the chidren of box 10: ',tenth_children)
})
```

```javascript
let fs = require('fs/promises')
let iso = require('isoinspector')

fs
.readFile('path-to-your-file')
.then(data => {
    let boxes = iso.tree(data)
    console.log('These are the boxes that compose the file: ',boxes)
})
```