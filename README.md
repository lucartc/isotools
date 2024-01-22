# ISO tools
This lib implements part of `ISO/IEC 14496-12 2015`, which is the specification for ISO Base Media File Format, a media container used my many file formats, including mp4.

## What's missing?
Boxes related to `AudioSampleEntry` won't be implemented at the moment, since I don't have access to `ISO/IEC
23003‐4` specification. If you can, please send me the spec at `jlucartc@gmail.com` or send a PR at the github repo.

If I eventually decide to implement it without the spec, I'll leave a warning here, because it will cause errors/malfunction if `DRCCoefficientsBasic`, `DRCCoefficientsUniDRC`, `DRCInstructionsBasic`,
and `DRCInstructionsUniDRC` boxes are not defined.

Sample entries will be implemented soon.

The following boxes and classes still need to be implemented:
`roll`,`visual_roll_recovery_entry`,`audio_roll_recovery_entry`,`prol`,`alst`,`rap`,`tele`,`sample_entry`,`btrt`,`visual_sample_entry`,`audio_sample_entry`,`audio_sample_entry_v1`,`meta_data_sample_entry`,`metx`,`txtC`,`mett`,`uri`,`uriI`,`urim`,`hint_sample_entry`,`plain_text_sample_entry`,`simple_text_sample_entry`,`subtitle_sample_entry`,`stpp`,`sbtt`,`font_sample_entry`,`tims`,`tsro`,`snro`,`fdsa`,`fdpa`,`lct_header_template`,`lct_header_extension`,`rrtp`,`rsrp`,`rssr`,`clap`,`pasp`,`srat`,`icpv`,`rtp_sample`,`rtp_packet`,`rtp_constructor`,`rtp_noopconstructor`,`rtp_immediateconstructor`,`rtp_sample_constructor`,`rtp_sample_description_constructor`,`hnti`,`rtp`,`sdp`,`trpy`,`nump`,`tpyl`,`totl`,`npck`,`tpay`,`maxr`,`dmed`,`dimm`,`drep`,`tmin`,`tmax`,`pmax`,`dmax`,`payt`,`fdp`,`fd_constructor`,`fd_noopconstructor`,`fd_immediateconstructor`,`fd_sample_constructor`,`fd_item_constructor`,`fd_item_constructor_large`,`fd_xml_box_constructor`,`rm2t`,`sm2t`,`mpeg2_ts_sample_entry`,`tPAT`,`tPMT`,`tOD`,`tsti`,`istm`,`mpeg2_ts_constructor`,`mpeg2_ts_immediate_constructor`,`mpeg2_ts_sample_constructor`,`mpeg2_ts_packet_representation`,`mpeg2_ts_sample`,`pm2t`,`tssy`,`rtpx`,`rcsr`,`received_rtcp_packet`,`received_rtcp_sample`,`ccid`,`sroc`,`prtp`,`rash`,`sap`,`colr`,`loudness_base_box`,`stxt`

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