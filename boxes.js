function create_box(data){
    let view = new DataView(data.buffer, data.byteOffset, data.length)
    let size = view.getUint32(0)
    let type = data.subarray(4, 8).toString().trim()
    let largesize = null
    let extended_type = null
    let body_offset = 8

    size = size == 0 ? data.byteLength : size
    body_offset = size == 1 ? 16 : body_offset
    body_offset = type == 'uuid' ? body_offset + 16 : body_offset

    largesize = size == 1 ? view.getBigUint64(8) : null
    extended_type = type == 'uuid' ? data.subarray(body_offset - 16).toString().trim() : null

    return {
        offset: data.byteOffset,
        size: size,
        type: type,
        largesize: largesize ? largesize.toString() : largesize,
        extended_type: extended_type,
        body_offset: body_offset
    }
}

function create_full_box(data){
    let view = new DataView(data.buffer, data.byteOffset, data.length)
    let size = view.getUint32(0)
    let type = data.subarray(4, 8).toString().trim()
    let largesize = null
    let extended_type = null
    let body_offset = 8
    let version = null
    let flags = null

    size = size == 0 ? data.byteLength : size
    body_offset = size == 1 ? 16 : body_offset
    body_offset = type == 'uuid' ? body_offset + 16 : body_offset

    largesize = size == 1 ? view.getBigUint64(8) : null
    extended_type = type == 'uuid' ? data.subarray(body_offset - 16).toString().trim() : null

    version = view.getUint8(body_offset)

    flags = view.getUint32(body_offset) & 0x00ffffff
    body_offset += 4

    return {
        offset: data.byteOffset,
        size: size,
        type: type,
        largesize: largesize ? largesize.toString() : largesize,
        extended_type: extended_type,
        version: version,
        flags: flags,
        body_offset: body_offset
    }
}

function create_box_tree(file, parent = null) { return get_next_box(file, parent) }

function get_next_box(file, parent, tree = []) {
    if (!file.byteLength) {
        return tree;
    }
    let view = new DataView(file.buffer, file.byteOffset)
    let size = view.getUint32(0)
    let type = file.subarray(4, 8).toString().trim()
    let header_size = 8
    let valid_types = new Set(Object.keys(methods))

    try {
        if (!valid_types.has(type)) {
            return get_next_box(file.subarray(1), parent, tree);
        }
    } catch (e) {
        if (e instanceof RangeError) {
            return tree
        }
        throw e
    }

    let largesize = size == 1 ? view.getBigUint64(8) : null
    largesize ? header_size += 8 : null

    let extended_type = type == 'uuid' ? file.subarray(header_size, header_size + 16).toString().trim() : null
    extended_type ? header_size += 16 : null

    size = largesize ? largesize : size
    size = size == 0 ? file.length : size
    type = extended_type ? extended_type : type

    let current_box = file.subarray(0, size)
    let tree_node = null

    tree_node = extract_data(type, current_box, parent)
    tree_node ? tree.push(tree_node) : null
    return size >= file.length ? tree : get_next_box(file.subarray(size), parent, tree)
}

/*
Receives a box and extracts fields data particular to
each type of box.
*/
function extract_data(type, box, parent) {
    try {
        return methods[type] ? methods[type](box, parent) : null
    } catch (err) {
        throw new Error(`Malformed '${type}' box`, { cause: err })
    }
}

let methods = {
    ftyp: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let major_brand = data.subarray(body_offset, body_offset + 4).toString().trim()
        let minor_version = view.getUint32(body_offset + 4)
        let compatible_brands = []

        body_offset += 8

        for (let i = 0; i < view.byteLength - body_offset; i += 4) {
            compatible_brands.push(data.subarray(body_offset + i, body_offset + i + 4).toString().trim())
        }

        box = {
            ...box,
            major_brand: major_brand,
            minor_version: minor_version,
            compatible_brands: compatible_brands
        }

        delete box.body_offset
        return box
    },
    pdin: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let pairs = []

        while (body_offset <= data.byteOffset + data.length) {
            pairs.push({
                rate: view.getUint32(body_offset),
                initial_delay: view.getUint32(body_offset + 4),
            })

            body_offset += 8
        }

        box = {
            ...box,
            pairs: pairs
        }

        delete box.body_offset
        return box
    },
    moov: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)

        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    mvhd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let creation_time = null
        let modification_time = null
        let timescale = null
        let duration = null
        let rate = null
        let volume = null
        let matrix = null
        let pre_defined = null
        let next_track_id = null
        let version_offset = 0

        if (box.version == 1) {
            creation_time = view.getBigUint64(body_offset)
            modification_time = view.getBigUint64(body_offset + 8)
            timescale = view.getUint32(body_offset + 16)
            duration = view.getBigUint64(body_offset + 20)
            version_offset = 28
        } else if (box.version == 0) {
            creation_time = view.getUint32(body_offset)
            modification_time = view.getUint32(body_offset + 4)
            timescale = view.getUint32(body_offset + 8)
            duration = view.getUint32(body_offset + 12)
            version_offset = 16
        }

        rate = view.getUint32(body_offset + version_offset)
        volume = view.getUint16(body_offset + version_offset + 4)
        matrix = Array.prototype.slice.call(data.subarray(body_offset + version_offset + 16, body_offset + version_offset + 52))
        pre_defined = Array.prototype.slice.call(data.subarray(body_offset + version_offset + 52, body_offset + version_offset + 76))
        try {
            next_track_id = view.getUint32(body_offset + version_offset + 76)
        } catch (err) {
            throw new Error(`version: ${version} view_size: ${view.byteLength}  body_offset: ${body_offset}  version_offset: ${version_offset} + 76`, { cause: err })
        }

        box = {
            ...box,
            creation_time: creation_time ? creation_time.toString() : creation_time,
            modification_time: modification_time ? modification_time.toString() : modification_time,
            timescale: timescale,
            duration: duration ? duration.toString() : duration,
            rate: rate,
            volume: volume,
            matrix: matrix,
            pre_defined: pre_defined,
            next_track_id: next_track_id
        }

        delete box.body_offset
        return box
    },
    meta: (data, parent = null) => { // DONE
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let children_data = data.subarray(body_offset)

        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    trak: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    tkhd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let creation_time = null
        let modification_time = null
        let track_id = null
        let duration = null
        let layer = null
        let alternate_group = null
        let volume = null
        let matrix = null
        let width = null
        let height = null

        if (box.version == 1) {
            creation_time = view.getBigUint64(body_offset)
            body_offset += 8

            modification_time = view.getBigUint64(body_offset)
            body_offset += 8

            track_id = view.getUint32(body_offset)
            body_offset += 8

            duration = view.getBigUint64(body_offset)
            body_offset += 8
        } else {
            creation_time = view.getUint32(body_offset)
            body_offset += 4

            modification_time = view.getUint32(body_offset)
            body_offset += 4

            track_id = view.getUint32(body_offset)
            body_offset += 8

            duration = view.getUint32(body_offset)
            body_offset += 4
        }

        body_offset += 8

        layer = view.getUint16(body_offset)
        body_offset += 2

        alternate_group = view.getUint16(body_offset)
        body_offset += 2

        volume = view.getUint16(body_offset)
        body_offset += 2

        matrix = Array.prototype.slice.call(data.subarray(body_offset, body_offset + 36))
        body_offset += 36

        width = view.getUint32(body_offset)
        body_offset += 4

        height = view.getUint32(body_offset)
        body_offset += 4

        box = {
            ...box,
            creation_time: creation_time ? creation_time.toString() : creation_time,
            modification_time: modification_time ? modification_time.toString() : modification_time,
            track_id: track_id,
            duration: duration ? duration.toString() : duration,
            layer: layer,
            alternate_group: alternate_group,
            volume: volume,
            matrix: matrix,
            width: width,
            height: height
        }

        delete box.body_offset
        return box
    },
    tref: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let track_ids = []

        while (body_offset < data.length) {
            track_ids.push(view.getUint32(body_offset))
            body_offset += 4
        }

        box = {
            ...box,
            track_ids: track_ids
        }

        delete box.body_offset
        return box
    },
    trgr: (data, parent = null) => { //DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    msrc: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let track_group_id = null
        track_group_id = view.getUint32(body_offset)

        box = {
            ...box,
            track_group_id: track_group_id
        }

        delete box.body_offset
        return box
    },
    edts: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    elst: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = null
        let entries = []

        entry_count = view.getUint32(body_offset)

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                segment_duration: null,
                media_time: null,
                media_rate_integer: null,
                media_rate_fraction: null
            }

            if (box.version == 1) {
                segment_duration = view.getBigUint64(body_offset).toString()
                media_time = view.getBigUint64(body_offset + 8).toString()
                body_offset += 16
            } else {
                segment_duration = view.getUint32(body_offset)
                media_time = view.getUint32(body_offset + 4)
                body_offset += 8
            }

            media_rate_integer = view.getUint16(body_offset)
            media_rate_fraction = view.getUint16(body_offset + 2)
            body_offset += 4

            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    mdia: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    mdhd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let creation_time = null
        let modification_time = null
        let timescale = null
        let duration = null
        let language = null
        let pre_defined = null

        if (box.version == 1) {
            creation_time = view.getBigUint64(body_offset)
            modification_time = view.getBigUint64(body_offset + 8)
            timescale = view.getUint32(body_offset + 16)
            duration = view.getBigUint64(body_offset + 20)
            body_offset += 28
        } else if (box.version == 0) {
            creation_time = view.getUint32(body_offset)
            modification_time = view.getUint32(body_offset + 4)
            timescale = view.getUint32(body_offset + 8)
            duration = view.getUint32(body_offset + 12)
            body_offset += 16
        }

        language = view.getUint16(body_offset) & 0x7fff
        pre_defined = view.getUint16(body_offset + 2)
        body_offset += 4

        box = {
            ...box,
            creation_time: creation_time ? creation_time.toString() : creation_time,
            modification_time: modification_time ? modification_time.toString() : modification_time,
            timescale: timescale ? timescale.toString() : timescale,
            duration: duration ? duration.toString() : duration,
            language: language,
            pre_defined: pre_defined
        }

        delete box.body_offset
        return box
    },
    hdlr: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let pre_defined = view.getUint32(body_offset)
        let handler_type = view.getUint32(body_offset + 4)
        let name = data.subarray(body_offset + 8, data.byteLength - 1).toString().trim()

        box = {
            ...box,
            pre_defined: pre_defined,
            handler_type: handler_type,
            name: name
        }

        delete box.body_offset
        return box
    },
    elng: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let extended_language = null
        let extended_language_start = body_offset

        while (view.getUint8(body_offset) != 0) {
            body_offset++
        }

        extended_language = data.subarray(extended_language_start, body_offset).toString().trim()

        box = {
            ...box,
            extended_language: extended_language
        }

        delete box.body_offset
        return box
    },
    minf: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    vmhd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let graphics_mode = null
        let opcolor = null

        graphics_mode = view.getUint16(body_offset)
        opcolor = Array.prototype.slice.call(data.subarray(body_offset + 2, body_offset + 8))
        body_offset += 8

        box = {
            ...box,
            graphics_mode: graphics_mode,
            opcolor: opcolor
        }

        delete box.body_offset
        return box
    },
    smhd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let balance = null
        balance = view.getUint16(body_offset)

        box = {
            ...box,
            balance: balance
        }

        delete box.body_offset
        return box
    },
    hmhd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let max_pdu_size = null
        let avg_pdu_size = null
        let max_bit_rate = null
        let avg_bit_rate = null

        max_pdu_size = view.getUint16(body_offset)
        avg_pdu_size = view.getUint16(body_offset + 2)
        max_bit_rate = view.getUint32(body_offset + 4)
        avg_bit_rate = view.getUint32(body_offset + 8)

        box = {
            ...box,
            max_pdu_size: max_pdu_size,
            avg_pdu_size: avg_pdu_size,
            max_bit_rate: max_bit_rate,
            avg_bit_rate: avg_bit_rate
        }

        delete box.body_offset
        return box
    },
    sthd: (data, parent = null) => { // DONE
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        delete box.body_offset
        return box
    },
    nmhd: (data, parent = null) => { // DONE
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        delete box.body_offset
        return box
    },
    dinf: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)

        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    dref: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = null

        entry_count = view.getUint32(body_offset)
        body_offset += 4

        let children_data = data.subarray(body_offset)

        box = {
            ...box,
            entry_count: entry_count
        }

        box.children = create_box_tree(children_data, box).slice(0, entry_count)
        delete box.body_offset
        return box
    },
    url: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let location = null
        let location_offset = body_offset

        if(box.flags != 1){
            while (view.getUint8(body_offset) != 0) {
                body_offset++
            }

            location = data.subarray(location_offset, body_offset).toString().trim()
        }

        box = {
            ...box,
            location: location
        }

        delete box.body_offset
        return box
    },
    urn: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let location = null
        let name = null
        let name_offset = body_offset
        let location_offset = null

        while (view.getUint8(body_offset) != 0) {
            body_offset++
        }

        name = data.subarray(name_offset, body_offset).toString().trim()
        body_offset++
        location_offset = body_offset

        while (view.getUint8(body_offset) != 0) {
            body_offset++
        }

        location = data.subarray(location_offset, body_offset).toString().trim()

        box = {
            ...box,
            name: name,
            location: location
        }

        delete box.body_offset
        return box
    },
    stbl: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    stsd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = null
        let entries = []

        entry_count = view.getUint32(body_offset)
        body_offset += 4

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                size: null,
                type: null,
                largesize: null,
                extended_type: null,
                data_reference_index: null
            }

            new_entry.size = view.getUint32(body_offset)
            new_entry.type = data.subarray(body_offset + 4, body_offset + 8).toString().trim()
            body_offset += 8

            new_entry.size = new_entry.size == 0 ? data.byteLength : new_entry.size
            new_entry.largesize = new_entry.size == 1 ? view.getBigUint64(body_offset).toString() : null
            new_entry.largesize ? body_offset += 8 : null
            new_entry.extended_type = box.type == 'uuid' ? data.subarray(body_offset, body_offset + 16).toString().trim() : null
            body_offset = box.type == 'uuid' ? body_offset + 16 : body_offset
            new_entry.data_reference_index = view.getUint16(body_offset + 6)
            body_offset += 8

            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    stts: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = null
        let entries = []

        entry_count = view.getUint32(body_offset)
        body_offset += 4

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                sample_count: null,
                sample_delta: null
            }

            new_entry.sample_count = view.getUint32(body_offset)
            new_entry.sample_delta = view.getUint32(body_offset + 4)
            body_offset += 8

            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    ctts: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = view.getUint32(body_offset)
        let entries = []
        body_offset += 4

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                sample_count: null,
                sample_offset: null
            }

            if (box.version == 0) {
                new_entry.sample_count = view.getUint32(body_offset)
                new_entry.sample_offset = view.getUint32(body_offset + 4)
            } else if (box.version == 1) {
                new_entry.sample_count = view.getUint32(body_offset)
                new_entry.sample_offset = view.getInt32(body_offset + 4)
            }

            body_offset += 8
            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    cslg: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let composition_to_dts_shift = null
        let least_decode_to_display_delta = null
        let greatest_decode_to_display_delta = null
        let composition_start_time = null
        let composition_end_time = null

        if (box.version == 0) {
            composition_to_dts_shift = view.getInt32(body_offset)
            least_decode_to_display_delta = view.getInt32(body_offset + 4)
            greatest_decode_to_display_delta = view.getInt32(body_offset + 8)
            composition_start_time = view.getInt32(body_offset + 12)
            composition_end_time = view.getInt32(body_offset + 16)
            body_offset += 20
        } else {
            composition_to_dts_shift = view.getBigInt64(body_offset)
            least_decode_to_display_delta = view.getBigInt64(body_offset + 8)
            greatest_decode_to_display_delta = view.getBigInt64(body_offset + 16)
            composition_start_time = view.getBigInt64(body_offset + 24)
            composition_end_time = view.getBigInt64(body_offset + 32)
            body_offset += 40
        }

        box = {
            ...box,
            composition_to_dts_shift: composition_to_dts_shift ? composition_to_dts_shift.toString() : composition_to_dts_shift,
            least_decode_to_display_delta: least_decode_to_display_delta ? least_decode_to_display_delta.toString() : least_decode_to_display_delta,
            greatest_decode_to_display_delta: greatest_decode_to_display_delta ? greatest_decode_to_display_delta.toString() : greatest_decode_to_display_delta,
            composition_start_time: composition_start_time ? composition_start_time.toString() : composition_start_time,
            composition_end_time: composition_end_time ? composition_end_time.toString() : composition_end_time
        }

        delete box.body_offset
        return box
    },
    stsc: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = view.getUint32(body_offset)
        let entries = []
        body_offset += 4

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                first_chunk: null,
                samples_per_chunk: null,
                sample_description_index: null
            }

            new_entry.first_chunk = view.getUint32(body_offset)
            new_entry.samples_per_chunk = view.getUint32(body_offset + 4)
            new_entry.sample_description_index = view.getUint32(body_offset + 8)
            body_offset += 12

            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    stsz: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let sample_size = view.getUint32(body_offset)
        let sample_count = view.getUint32(body_offset + 4)
        let samples = []
        body_offset += 8

        if (sample_size == 0) {
            for (let i = 0; i < sample_count; i++) {
                samples.push(view.getUint32(body_offset))
                body_offset += 4
            }
        }

        box = {
            ...box,
            sample_size: sample_size,
            sample_count: sample_count,
            samples: samples
        }

        delete box.body_offset
        return box
    },
    stz2: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        flags = view.getUint32(body_offset) & 0x00ffffff
        body_offset += 7

        let field_size = view.getUint8(body_offset)
        let sample_count = view.getUint32(body_offset + 1)
        let samples = []
        body_offset += 5

        for (let i = 0; i < sample_count; i++) {
            switch (field_size) {
                case 4:
                    if (i % 2) {
                        samples.push(view.getUint8(body_offset) >> 4)
                    } else {
                        samples.push(view.getUint8(body_offset) & 0x0f)
                        body_offset++
                    }
                    break;
                case 8:
                    samples.push(view.getUint8(body_offset))
                    body_offset++
                    break;
                case 16:
                    samples.push(view.getUint16(body_offset))
                    body_offset += 2
                    break;
            }
        }

        box = {
            ...box,
            field_size: field_size,
            sample_count: sample_count,
            samples: samples
        }

        delete box.body_offset
        return box
    },
    stco: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entries = []
        let entry_count = view.getUint32(body_offset)
        body_offset += 4

        for (let i = 0; i < entry_count; i++) {
            entries.push(view.getUint32(body_offset).toString())
            body_offset += 4
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    co64: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entries = []
        let entry_count = view.getUint32(body_offset)
        body_offset += 4

        for (let i = 0; i < entry_count; i++) {
            entries.push(view.getBigUint64(body_offset).toString())
            body_offset += 8
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    stss: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entries = []
        let entry_count = view.getUint32(body_offset)
        body_offset += 4

        for (let i = 0; i < entry_count; i++) {
            entries.push(view.getUint32(body_offset))
            body_offset += 4
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    stsh: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entries = []
        let entry_count = view.getUint32(body_offset)
        body_offset += 4

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                shadowed_sample_number: null,
                sync_sample_number: null
            }

            new_entry.shadowed_sample_number = view.getUint32(body_offset)
            new_entry.sync_sample_number = view.getUint32(body_offset + 4)
            body_offset += 4

            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    padb: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let samples = []
        let sample_count = view.getUint32(body_offset)
        body_offset += 4

        for (let i = 0; i < (sample_count + 1) / 2; i++) {
            let new_sample = {
                pad1: null,
                pad2: null
            }

            new_sample.pad1 = view.getUint8(body_offset) & 0x70
            new_sample.pad2 = view.getUint8(body_offset) & 0x07
            body_offset++

            samples.push(new_sample)
        }

        box = {
            ...box,
            sample_count: sample_count,
            samples: samples
        }

        delete box.body_offset
        return box
    },
    stdp: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let priorities = []

        while (body_offset < data.length) {
            try {
                priorities.push(view.getUint16(body_offset))
                body_offset += 2
            } catch (err) { }
        }

        box = {
            ...box,
            priorities: priorities
        }

        delete box.body_offset
        return box
    },
    sdtp: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let samples = []

        while (body_offset < data.length) {
            let new_sample = {
                is_leading: null,
                sample_depends_on: null,
                sample_is_depended_on: null,
                sample_has_redundancy: null
            }

            try {
                new_sample.is_leading = view.getUint8(body_offset) >> 6
                new_sample.sample_depends_on = (view.getUint8(body_offset) >> 4) & 0x03
                new_sample.sample_is_depended_on = (view.getUint8(body_offset) >> 2) & 0x03
                new_sample.sample_has_redundancy = view.getUint8(body_offset) & 0x03
                body_offset++

                samples.push(new_sample)
            } catch (err) { }
        }

        box = {
            ...box,
            samples: samples
        }

        delete box.body_offset
        return box
    },
    sbgp: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let grouping_type = null
        let grouping_type_parameter = null
        let entry_count = null
        let entries = []

        grouping_type = view.getUint32(body_offset)
        body_offset += 4

        if (box.version == 1) {
            grouping_type_parameter = view.getUint32(body_offset)
            body_offset += 4
        }

        entry_count = view.getUint32(body_offset)

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                sample_count: null,
                group_description_index: null
            }

            new_entry.sample_count = view.getUint32(body_offset)
            new_entry.group_description_index = view.getUint32(body_offset + 4)
            body_offset += 8

            entries.push(new_entry)
        }

        box = {
            ...box,
            grouping_type: grouping_type,
            grouping_type_parameter: grouping_type_parameter,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    sgpd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1, 2, 3])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let grouping_type = null
        let default_length = null
        let default_sample_description_index = null
        let entry_count = null
        let entries = []

        grouping_type = view.getUint32(body_offset)
        body_offset += 4

        if (box.version == 1) {
            default_length = view.getUint32(body_offset)
            body_offset += 4
        }

        if (box.version >= 2) {
            default_sample_description_index = view.getUint32(body_offset)
            body_offset += 4
        }

        entry_count = view.getUint32(body_offset)
        body_offset += 4

        box = {
            ...box,
            grouping_type: grouping_type,
            default_length: default_length,
            default_sample_description_index: default_sample_description_index,
            entry_count: entry_count,
        }

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                description_length: null,
                sample_group_entry: null
            }

            if (box.version == 1) {
                if (default_length == 0) {
                    new_entry.description_length = view.getUint32(body_offset)
                    body_offset += 4
                }
            }

            let children_data = data.subarray(body_offset, body_offset + new_entry.description_length)
            let children = create_box_tree(children_data, box)
            new_entry.sample_group_entry = children.shift()
            body_offset += new_entry.description_length
            entries.push(new_entry)
        }

        box.entries = entries
        delete box.body_offset
        return box
    },
    subs: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entries = []
        let entry_count = view.getUint32(body_offset)
        body_offset += 4

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                sample_delta: null,
                subsample_count: null,
                subsamples: []
            }

            new_entry.sample_delta = view.getUint32(body_offset)
            new_entry.subsample_count = view.getUint16(body_offset + 4)
            body_offset += 6

            if (new_entry.subsample_count > 0) {
                let new_subsample = {
                    subsample_size: null,
                    subsample_priority: null,
                    discardable: null,
                    codec_specific_parameters: null
                }

                if (box.version == 1) {
                    new_subsample.subsample_size = view.getUint32(body_offset)
                    body_offset += 4
                } else {
                    new_subsample.subsample_size = view.getUint16(body_offset)
                    body_offset += 2
                }

                new_subsample.subsample_priority = view.getUint8(body_offset)
                new_subsample.discardable = view.getUint8(body_offset + 1)
                new_subsample.codec_specific_parameters = view.getUint32(body_offset + 2)
                body_offset += 6

                new_entry.subsamples.push(new_subsample)
            }

            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    saiz: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let aux_info_type = null
        let aux_info_type_parameter = null
        let default_sample_info_size = null
        let sample_count = null
        let sample_info_size = null

        if (flags & 0x000001) {
            aux_info_type = view.getUint32(body_offset)
            aux_info_type_parameter = view.getUint32(body_offset + 4)
            body_offset += 8
        }

        default_sample_info_size = view.getUint8(body_offset)
        sample_count = view.getUint32(body_offset + 1)
        body_offset += 5

        if (default_sample_info_size == 0) {
            sample_info_size = Array.prototype.slice.call(data.subarray(body_offset, body_offset + sample_count))
        }

        box = {
            ...box,
            aux_info_type: aux_info_type,
            aux_info_type_parameter: aux_info_type_parameter,
            default_sample_info_size: default_sample_info_size,
            sample_count: sample_count,
            sample_info_size: sample_info_size
        }

        delete box.body_offset
        return box
    },
    saio: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let aux_info_type = null
        let aux_info_type_parameter = null
        let entry_count = null
        let offsets = null

        if (flags & 0x000001) {
            aux_info_type = view.getUint32(body_offset)
            aux_info_type_parameter = view.getUint32(body_offset + 4)
            body_offset += 8
        }

        if (box.version == 0) {
            offsets = Array.prototype.slice.call(data.subarray(body_offset, body_offset + 4 * entry_count))
        } else {
            offsets = Array.prototype.slice.call(data.subarray(body_offset, body_offset + 8 * entry_count))
        }

        box = {
            ...box,
            aux_info_type: aux_info_type,
            aux_info_type_parameter: aux_info_type_parameter,
            entry_count: entry_count,
            offsets: offsets
        }

        delete box.body_offset
        return box
    },
    udta: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    kind: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let scheme_uri = null
        let value = null
        let scheme_uri_offset = body_offset
        let value_offset = null

        while (view.getUint8(body_offset) != 0) {
            body_offset++
        }

        scheme_uri = data.subarray(scheme_uri_offset, body_offset).toString().trim()
        body_offset++
        value_offset = body_offset

        while (view.getUint8(body_offset) != 0) {
            body_offset++
        }

        value = data.subarray(value_offset, body_offset).toString().trim()

        box = {
            ...box,
            scheme_uri: scheme_uri,
            value: value
        }

        delete box.body_offset
        return box
    },
    mvex: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    mehd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let fragment_duration = null

        if (box.version == 1) {
            fragment_duration = view.getBigUint64(body_offset)
            body_offset += 8
        } else {
            fragment_duration = view.getUint32(body_offset)
            body_offset += 4
        }

        box = {
            ...box,
            fragment_duration: fragment_duration ? fragment_duration.toString() : fragment_duration,
        }

        delete box.body_offset
        return box
    },
    trex: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let track_id = view.getUint32(body_offset)
        let default_sample_description_index = view.getUint32(body_offset + 4)
        let default_sample_duration = view.getUint32(body_offset + 8)
        let default_sample_size = view.getUint32(body_offset + 12)
        let default_sample_flags_raw = view.getUint32(body_offset + 16)
        let default_sample_flags = {
            is_leading: (default_sample_flags_raw >> 26) & 0x00000003,
            sample_depends_on: (default_sample_flags_raw >> 24) & 0x00000003,
            sample_is_depended_on: (default_sample_flags_raw >> 22) & 0x00000003,
            sample_has_redundancy: (default_sample_flags_raw >> 20) & 0x00000003,
            sample_padding_value: (default_sample_flags_raw >> 17) & 0x00000007,
            sample_is_non_sync_sample: (default_sample_flags_raw >> 16) & 0x00000001,
            sample_degradation_priority: default_sample_flags_raw & 0x0000ffff
        }

        body_offset += 16

        box = {
            ...box,
            track_id: track_id,
            default_sample_description_index: default_sample_description_index,
            default_sample_duration: default_sample_duration,
            default_sample_size: default_sample_size,
            default_sample_flags: default_sample_flags
        }

        delete box.body_offset
        return box
    },
    trep: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let track_id = view.getUint32(body_offset)
        body_offset += 4

        let children_data = data.subarray(body_offset)

        box = {
            ...box,
            track_id: track_id
        }

        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    assp: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let min_initial_alt_startup_offset = null
        let num_entries = null
        let entries = []

        if (box.version == 0) {
            min_initial_alt_startup_offset = view.getUint32(body_offset)
            body_offset += 4
        } else if (box.version == 1) {
            num_entries = view.getUint32(body_offset)
            body_offset += 4

            for (let i = 0; i < num_entries; i++) {
                let new_entry = {
                    grouping_type_parameter: null,
                    min_initial_alt_startup_offset: null
                }

                new_entry.grouping_type_parameter = view.getUint32(body_offset)
                new_entry.min_initial_alt_startup_offset = view.getInt32(body_offset + 4)
                body_offset += 8

                entries.push(new_entry)
            }
        }

        box = {
            ...box,
            min_initial_alt_startup_offset: min_initial_alt_startup_offset,
            num_entries: num_entries,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    leva: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let levels = []
        let level_count = view.getUint8(body_offset)
        body_offset++

        for (let i = 0; i < level_count; i++) {
            let new_level = {
                track_id: null,
                padding_flag: null,
                assignment_type: null,
                grouping_type: null,
                grouping_type_parameter: null,
                sub_track_id: null
            }

            new_level.track_id = view.getUint32(body_offset)
            new_level.padding_flag = view.getUint8(body_offset) >> 7
            new_level.assignment_type = view.getUint8(body_offset) & 0x7f

            if (new_level.assignment_type == 0) {
                new_level.grouping_type = view.getUint32(body_offset)
                body_offset += 4
            } else if (new_level.assignment_type == 1) {
                new_level.grouping_type = view.getUint32(body_offset)
                new_level.grouping_type_parameter = view.getUint32(body_offset + 4)
                body_offset += 8
            } else if (new_level.assignment_type == 4) {
                new_level.sub_track_id = view.getUint32(body_offset)
                body_offset += 4
            }

            levels.push(new_level)
        }

        box = {
            ...box,
            level_count: level_count,
            levels: levels
        }

        delete box.body_offset
        return box
    },
    moof: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    mfhd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let sequence_number = view.getUint32(body_offset)
        body_offset += 4

        box = {
            ...box,
            sequence_number: sequence_number
        }

        delete box.body_offset
        return box
    },
    traf: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    tfhd: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let track_id = null
        let base_data_offset = null
        let sample_description_index = null
        let default_sample_duration = null
        let default_sample_size = null
        let default_sample_flags = null
        let duration_is_empty = null
        let default_base_is_moof = null

        track_id = view.getUint32(body_offset)
        body_offset += 4

        base_data_offset = box.flags & 0x000001 ? view.getBigUint64(body_offset) : null
        body_offset += box.flags & 0x000001 ? 8 : 0

        sample_description_index = box.flags & 0x000002 ? view.getUint32(body_offset) : null
        body_offset += box.flags & 0x000002 ? 4 : 0

        default_sample_duration = box.flags & 0x000008 ? view.getUint32(body_offset) : null
        body_offset += box.flags & 0x000008 ? 4 : 0

        default_sample_size = box.flags & 0x000010 ? view.getUint32(body_offset) : null
        body_offset += box.flags & 0x000010 ? 4 : 0

        default_sample_flags = box.flags & 0x000020 ? view.getUint32(body_offset) : null
        body_offset += box.flags & 0x000020 ? 4 : 0

        duration_is_empty = box.flags & 0x010000
        default_base_is_moof = box.flags & 0x020000

        box = {
            ...box,
            track_id: track_id,
            base_data_offset: base_data_offset ? base_data_offset.toString() : base_data_offset,
            sample_description_index: sample_description_index,
            default_sample_duration: default_sample_duration,
            default_sample_size: default_sample_size,
            default_sample_flags: default_sample_flags,
        }

        delete box.body_offset
        return box
    },
    trun: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let sample_count = null
        let data_offset = null
        let first_sample_flags = null
        let samples = []

        sample_count = view.getUint32(body_offset)
        body_offset += 4

        data_offset = box.flags & 0x000001 ? view.getInt32(body_offset) : null
        body_offset += box.flags & 0x000001 ? 4 : 0

        first_sample_flags = box.flags & 0x000004 ? view.getUint32(body_offset) : null
        body_offset += box.flags & 0x000004 ? 4 : 0

        for (let i = 0; i < sample_count; i++) {
            let new_sample = {
                sample_duration: null,
                sample_size: null,
                sample_flags: null,
                sample_composition_time_offset: null
            }

            if (i != 0) {
                new_sample.sample_duration = box.flags & 0x000100 ? view.getUint32(body_offset) : null
                body_offset += box.flags & 0x000100 ? 4 : 0

                new_sample.sample_size = box.flags & 0x000200 ? view.getUint32(body_offset) : null
                body_offset += box.flags & 0x000200 ? 4 : 0

                new_sample.sample_flags = box.flags & 0x000400 ? view.getUint32(body_offset) : null
                body_offset += box.flags & 0x000400 ? 4 : 0

                new_sample.sample_composition_time_offset = box.flags & 0x000800 ? view.getUint32(body_offset) : null
                body_offset += box.flags & 0x000800 ? 4 : 0

                samples.push(new_sample)
            } else {
                new_sample.sample_duration = (first_sample_flags ? first_sample_flags : box.flags) & 0x000100 ? view.getUint32(body_offset) : null
                body_offset += (first_sample_flags ? first_sample_flags : box.flags) & 0x000100 ? 4 : 0

                new_sample.sample_size = (first_sample_flags ? first_sample_flags : box.flags) & 0x000200 ? view.getUint32(body_offset) : null
                body_offset += (first_sample_flags ? first_sample_flags : box.flags) & 0x000200 ? 4 : 0

                new_sample.sample_first_sample_flags = (first_sample_flags ? first_sample_flags : box.flags) & 0x000400 ? view.getUint32(body_offset) : null
                body_offset += (first_sample_flags ? first_sample_flags : box.flags) & 0x000400 ? 4 : 0

                new_sample.sample_composition_time_offset = (first_sample_flags ? first_sample_flags : box.flags) & 0x000800 ? view.getUint32(body_offset) : null
                body_offset += (first_sample_flags ? first_sample_flags : box.flags) & 0x000800 ? 4 : 0

                samples.push(new_sample)
            }
        }

        box = {
            ...box,
            sample_count: sample_count,
            data_offset: data_offset,
            first_sample_flags: first_sample_flags,
            samples: samples
        }

        delete box.body_offset
        return box
    },
    tfdt: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let base_media_decode_time = null

        if (box.version == 1) {
            base_media_decode_time = view.getBigUint64(body_offset)
            body_offset += 8
        } else {
            base_media_decode_time = view.getUint32(body_offset)
            body_offset += 4
        }

        box = {
            ...box,
            base_media_decode_time: base_media_decode_time ? base_media_decode_time.toString() : base_media_decode_time
        }

        delete box.body_offset
        return box
    },
    mfra: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    tfra: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let track_id = null
        let length_size_of_traf_num = null
        let length_size_of_trun_num = null
        let length_size_of_sample_num = null
        let number_of_entry = null
        let entries = []

        track_id = view.getUint32(body_offset)
        body_offset += 4
        length_size_of_traf_num = view.getUint32(body_offset) & 0x00000030
        length_size_of_trun_num = view.getUint32(body_offset) & 0x0000000c
        length_size_of_sample_num = view.getUint32(body_offset) & 0x00000003
        body_offset += 4
        number_of_entry = view.getUint32(body_offset)

        for (let i = 0; i <= number_of_entry; i++) {
            let new_entry = {
                time: null,
                moof_offset: null,
                traf_number: null,
                trun_number: null,
                sample_number: null
            }

            if (box.version == 1) {
                new_entry.time = view.getBigUint64(body_offset).toString()
                new_entry.moof_offset = view.getBigUint64(body_offset + 8).toString()
                body_offset += 16
            } else {
                new_entry.time = view.getUint32(body_offset)
                new_entry.moof_offset = view.getUint32(body_offset + 4)
                body_offset += 8
            }

            switch (length_size_of_traf_num) {
                case 0:
                    new_entry.traf_number = view.getUint8(body_offset)
                    body_offset++
                    break;
                case 1:
                    new_entry.traf_number = view.getUint16(body_offset)
                    body_offset += 2
                    break;
                case 2:
                    new_entry.traf_number = view.getUint32(body_offset) >> 8
                    body_offset += 3
                    break;
                case 3:
                    new_entry.traf_number = view.getUint32(body_offset)
                    body_offset += 4
                    break;
            }

            switch (length_size_of_trun_num) {
                case 0:
                    new_entry.trun_number = view.getUint8(body_offset)
                    body_offset++
                    break;
                case 1:
                    new_entry.trun_number = view.getUint16(body_offset)
                    body_offset += 2
                    break;
                case 2:
                    new_entry.trun_number = view.getUint32(body_offset) >> 8
                    body_offset += 3
                    break;
                case 3:
                    new_entry.trun_number = view.getUint32(body_offset)
                    body_offset += 4
                    break;
            }

            switch (length_size_of_sample_num) {
                case 0:
                    new_entry.sample_number = view.getUint8(body_offset)
                    body_offset++
                    break;
                case 1:
                    new_entry.sample_number = view.getUint16(body_offset)
                    body_offset += 2
                    break;
                case 2:
                    new_entry.sample_number = view.getUint32(body_offset) >> 8
                    body_offset += 3
                    break;
                case 3:
                    new_entry.sample_number = view.getUint32(body_offset)
                    body_offset += 4
                    break;
            }

            entries.push(new_entry)
        }

        box = {
            ...box,
            track_id: track_id,
            length_size_of_traf_num: length_size_of_traf_num,
            length_size_of_trun_num: length_size_of_trun_num,
            length_size_of_sample_num: length_size_of_sample_num,
            number_of_entry: number_of_entry,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    mfro: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let mfra_size = view.getUint32(body_offset)
        body_offset += 4

        box = {
            ...box,
            mfra_size: mfra_size
        }

        delete box.body_offset
        return box
    },
    mdat: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let data_array = []

        try{
            for (let i = body_offset; i < data.length; i++) {
                data_array.push(view.getUint8(i))
            }
        }catch(err){
            debugger
        }

        box = {
            ...box,
            data: data_array
        }

        delete box.body_offset
        return box
    },
    free: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let data_array = []

        for (let i = body_offset; i < data.length; i++) {
            data_array.push(view.getUint8(i))
        }

        box = {
            ...box,
            data: data_array
        }

        delete box.body_offset
        return box
    },
    skip: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let data_array = []

        for (let i = body_offset; i < data.length; i++) {
            data_array.push(view.getUint8(i))
        }

        box = {
            ...box,
            data: data_array
        }

        delete box.body_offset
        return box
    },
    cprt: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let language = null
        let notice = null

        language = view.getUint16(body_offset) & 0x7fff
        body_offset += 2

        let notice_offset = body_offset
        let notice_first_bytes = view.getUint16(body_offset)

        while (view.getUint8(body_offset) != 0) {
            body_offset++
        }

        if (notice_first_bytes == 0xfeff) {
            notice = data.subarray(notice_offset + 1, body_offset).toString('utf-16').trim()
        } else {
            notice = data.subarray(notice_offset, body_offset).toString().trim()
        }

        box = {
            ...box,
            language: language,
            notice: notice
        }

        delete box.body_offset
        return box
    },
    tsel: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let switch_group = null
        let attribute_list = []

        switch_group = view.getUint32(body_offset)
        body_offset += 4

        while (body_offset < data.length) {
            attribute_list.push(view.getUint32(i))
            body_offset += 4
        }

        box = {
            ...box,
            switch_group: switch_group,
            attribute_list: attribute_list
        }

        delete box.body_offset
        return box
    },
    strk: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    stri: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let switch_group = null
        let alternate_group = null
        let sub_track_id = null
        let attribute_list = []

        switch_group = view.getUint16(body_offset)
        alternate_group = view.getUint16(body_offset + 2)
        sub_track_id = view.getUint32(body_offset + 4)
        body_offset += 8

        while (body_offset < data.length) {
            attribute_list.push(view.getUint32(body_offset))
            body_offset += 4
        }

        box = {
            ...box,
            switch_group: switch_group,
            alternate_group: alternate_group,
            sub_track_id: sub_track_id,
            attribute_list: attribute_list
        }

        delete box.body_offset
        return box
    },
    strd: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    stsg: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let grouping_type = null
        let item_count = null
        let items = []

        grouping_type = view.getUint32(body_offset)
        item_count = view.getUint16(body_offset + 4)
        body_offset += 6

        for (let i = 0; i < item_count; i++) {
            items.push(view.getUint32(body_offset))
            body_offset += 4
        }

        box = {
            ...box,
            grouping_type: grouping_type,
            item_count: item_count,
            items: items
        }

        delete box.body_offset
        return box
    },
    iloc: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1, 2])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let offset_size = null
        let length_size = null
        let base_offset_size = null
        let index_size = null
        let item_count = null
        let items = []

        offset_size = view.getUint8(body_offset) >> 4
        length_size = view.getUint8(body_offset) & 15
        body_offset++
        base_offset_size = view.getUint8(body_offset) >> 4

        if (box.version == 1 || box.version == 2) {
            index_size = view.getUint8(body_offset) & 15
        }

        body_offset++

        if (box.version < 2) {
            item_count = view.getUint16(body_offset)
            body_offset += 2
        } else if (box.version == 2) {
            item_count = view.getUint32(body_offset)
            body_offset += 4
        }

        let items_offset = body_offset

        for (let i = 0; i < item_count; i++) {
            let new_item_offset = items_offset

            let new_item = {
                item_id: '',
                construction_method: '',
                data_reference_index: '',
                base_offset: '',
                extent_count: '',
                extents: []
            }

            if (box.version < 2) {
                new_item.item_id = view.getUint16(new_item_offset)
                new_item_offset += 2
            } else if (box.version == 2) {
                new_item.item_id = view.getUint32(new_item_offset)
                new_item_offset += 4
            }

            if (box.version == 1 || box.version == 2) {
                new_item.construction_method = view.getUint16(new_item_offset) & 15
                new_item_offset += 2
            }

            new_item.data_reference_index = view.getUint16(new_item_offset)
            new_item_offset += 2

            switch (base_offset_size) {
                case 0:
                    new_item.base_offset = null
                    break;
                case 4:
                    new_item.base_offset = view.getUint32(new_item_offset)
                    break;
                case 8:
                    new_item.base_offset = view.getBigUint64(new_item_offset).toString()
                    break;
                default:
                    throw new Error(`Invalid size of ${base_offset_size} bytes for base_offset_size field`)
            }

            new_item_offset += base_offset_size
            new_item.extent_count = view.getUint16(new_item_offset)
            new_item_offset += 2

            let extents_offset = new_item_offset

            for (let j = 0; j < new_item.extent_count; j++) {
                let new_extent_offset = extents_offset

                let new_extent = {
                    extent_index: '',
                    extent_offset: '',
                    extent_length: ''
                }

                if ((box.version == 1 || box.version == 2) && index_size > 0) {
                    switch (index_size) {
                        case 4:
                            new_extent.extent_index = view.getUint32(new_extent_offset)
                            break;
                        case 8:
                            new_extent.extent_index = view.getBigUint64(new_extent_offset).toString()
                            break;
                        default:
                            throw new Error(`Invalid value of ${index_size} bytes for index_size field in iloc`)
                    }

                    new_extent_offset += index_size
                } else {
                    new_extent.extent_index = null
                }

                switch (offset_size) {
                    case 0:
                        new_extent.extent_offset = null
                        break;
                    case 4:
                        new_extent.extent_offset = view.getUint32(new_extent_offset)
                        break;
                    case 8:
                        new_extent.extent_offset = view.getBigUint64(new_extent_offset).toString()
                        break;
                }

                new_extent_offset += offset_size

                switch (length_size) {
                    case 0:
                        new_extent.extent_length = null
                        break;
                    case 4:
                        new_extent.extent_offset = view.getUint32(new_extent_offset)
                        break;
                    case 8:
                        new_extent.extent_offset = view.getBigUint64(new_extent_offset).toString()
                        break;
                }

                new_extent_offset += length_size
                extents_offset += new_extent_offset - extents_offset
                new_item.extents.push(new_extent)
            }

            new_item_offset = extents_offset
            items_offset += new_item_offset - items_offset
            items.push(new_item)
        }

        box = {
            ...box,
            offset_size: offset_size,
            length_size: length_size,
            base_offset_size: base_offset_size,
            index_size: index_size,
            item_count: item_count,
            items: items
        }

        delete box.body_offset
        return box
    },
    ipro: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let protection_count = null
        let protections = []

        protection_count = view.getUint16(body_offset)
        body_offset += 2

        box = {
            ...box,
            protection_count: protection_count
        }

        all_protections = create_box_tree(data.slice(body_offset, data.byteLength), box)
        box.children = all_protections.slice(0, protection_count)
        delete box.body_offset
        return box
    },
    sinf: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    rinf: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    srpp: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let encryption_algorithm_rtp = null
        let encryption_algorithm_rtcp = null
        let integrity_algorithm_rtp = null
        let integrity_algorithm_rtcp = null
        let children_data = data.subarray(body_offset)

        encryption_algorithm_rtp = view.getUint32(body_offset)
        encryption_algorithm_rtcp = view.getUint32(body_offset + 4)
        integrity_algorithm_rtp = view.getUint32(body_offset + 8)
        integrity_algorithm_rtcp = view.getUint32(body_offset + 12)
        body_offset += 16

        box = {
            ...box,
            encryption_algorithm_rtp: encryption_algorithm_rtp,
            encryption_algorithm_rtcp: encryption_algorithm_rtcp,
            integrity_algorithm_rtp: integrity_algorithm_rtp,
            integrity_algorithm_rtcp: integrity_algorithm_rtcp
        }

        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    frma: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset
        let data_format = data.subarray(body_offset, body_offset + 4).toString().trim()

        box = {
            ...box,
            data_format: data_format
        }

        delete box.body_offset
        return box
    },
    schm: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let scheme_type = null
        let scheme_version = null
        let scheme_uri = null

        scheme_type = data.subarray(body_offset, body_offset + 4).toString().trim()
        scheme_version = view.getUint32(body_offset + 4)
        body_offset += 8

        if (flags & 0x000001) {
            let scheme_uri_offset = body_offset
            while (view.getUint8(body_offset) != 0) {
                body_offset++
            }

            scheme_uri = data.subarray(scheme_uri_offset, body_offset).toString().trim()
            body_offset++
        }

        box = {
            ...box,
            scheme_type: scheme_type,
            scheme_version: scheme_version,
            scheme_uri: scheme_uri
        }

        delete box.body_offset
        return box
    },
    schi: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    stvi: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let single_view_allowed = null
        let stereo_scheme = null
        let length = null
        let stereo_indication_type = null

        single_view_allowed = view.getUint32(body_offset) & 0x00000003
        stereo_scheme = view.getUint32(body_offset + 1)
        length = view.getUint32(body_offset + 5)
        body_offset += 9

        switch (length) {
            case 2:
                stereo_indication_type = view.getUint16(body_offset)
                body_offset += 2
                break;
            case 4:
                stereo_indication_type = view.getUint32(body_offset)
                body_offset += 4
                break;
        }

        let children_data = data.subarray(body_offset)

        box = {
            ...box,
            single_view_allowed: single_view_allowed,
            stereo_scheme: stereo_scheme,
            length: length,
            stereo_indication_type: stereo_indication_type
        }

        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    iinf: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = null
        let item_infos = []

        if (box.version == 0) {
            entry_count = view.getUint16(body_offset)
            body_offset += 2
        } else {
            entry_count = view.getUint32(body_offset)
            body_offset += 4
        }

        box = {
            ...box,
            entry_count: entry_count
        }

        item_infos = create_box_tree(data.subarray(body_offset))

        box.children = item_infos
        delete box.body_offset
        return box
    },
    infe: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1, 2, 3])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let item_id = null
        let item_protection_index = null
        let item_name = null
        let content_type = null
        let content_encoding = null
        let extension_type = null
        let item_info_extension = null
        let item_type = null
        let item_uri_type = null

        if (box.version == 0 || box.version == 1) {
            item_id = view.getUint16(body_offset)
            body_offset += 2

            item_protection_index = view.getUint16(body_offset)
            body_offset += 2

            let item_name_offset = body_offset

            while (view.getUint8(item_name_offset) != 0) {
                item_name_offset++
            }

            item_name = data.subarray(body_offset, item_name_offset).toString().trim()
            body_offset = item_name_offset + 1

            let content_type_offset = body_offset

            while (view.getUint8(content_type_offset) != 0) {
                content_type_offset++
            }

            content_type = data.subarray(body_offset, content_type_offset).toString().trim()
            body_offset = content_type_offset + 1

            let content_encoding_offset = body_offset

            while (view.getUint8(content_encoding_offset) != 0 || content_encoding_offset >= data.byteLength) {
                content_encoding_offset++
            }

            content_encoding = data.subarray(body_offset, content_encoding_offset).toString().trim()
            body_offset = content_encoding_offset + 1
        }

        if (box.version == 1) {
            if (body_offset < data.byteLength) {
                extension_type = view.getUint32(body_offset)
                body_offset += 4

                item_info_extension = extract_data('fdel', data.subarray(body_offset))
            }
        }

        if (box.version >= 2) {
            if (box.version == 2) {
                item_id = view.getUint16(body_offset)
                body_offset += 2
            } else if (box.version == 3) {
                item_id = view.getUint32(body_offset)
                body_offset += 4
            }

            item_protection_index = view.getUint16(body_offset)
            body_offset += 2

            item_type = data.subarray(body_offset, body_offset + 4).toString().trim()
            body_offset += 4

            let item_name_offset = body_offset

            while (view.getUint8(item_name_offset) != 0) {
                item_name_offset++
            }

            item_name = data.subarray(body_offset, item_name_offset).toString().trim()
            body_offset = item_name_offset + 1

            if (item_type == 'mime') {
                let content_type_offset = body_offset

                while (view.getUint8(content_type_offset) != 0) {
                    content_type_offset++
                }

                content_type = data.subarray(body_offset, content_type_offset).toString().trim()
                body_offset = content_type_offset + 1

                let content_encoding_offset = body_offset

                while (view.getUint8(content_encoding_offset) != 0 || content_encoding_offset >= data.byteLength) {
                    content_encoding_offset++
                }

                content_encoding = data.subarray(body_offset, content_encoding_offset).toString().trim()
                body_offset = content_encoding_offset + 1
            } else if (item_type == 'uri') {
                item_uri_type = data.subarray(body_offset).toString().trim()
            }
        }

        box = {
            ...box,
            item_id: item_id,
            item_protection_index: item_protection_index,
            item_name: item_name,
            content_type: content_type,
            content_encoding: content_encoding,
            extension_type: extension_type,
            item_info_extension: item_info_extension,
            item_type: item_type,
            item_type_uri: item_uri_type
        }

        delete box.body_offset
        return box
    },
    fdel: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let body_offset = 0
        let content_location = null
        let content_md5 = null
        let content_length = null
        let transfer_length = null
        let entry_count = null
        let entries = []

        while (view.getUint8(body_offset) != 0) {
            body_offset++
        }

        content_location = data.subarray(0, body_offset).toString().trim()
        body_offset++

        let content_md5_offset = body_offset

        while (view.getUint8(body_offset) != 0) {
            body_offset++
        }

        content_md5 = data.subarray(content_md5_offset, body_offset).toString().trim()
        body_offset++

        content_length = view.getBigUint64(body_offset)
        body_offset += 8

        transfer_length = view.getBigUint64(body_offset)
        body_offset += 8

        entry_count = view.getUint8(body_offset)

        for (let i = 0; i < entry_count; i++) {
            entries.push(view.getUint32(body_offset))
            body_offset += 4
        }

        return {
            content_location: content_location,
            content_md5: content_md5,
            content_length: content_length ? content_length.toString() : content_length,
            transfer_length: transfer_length ? transfer_length.toString() : transfer_length,
            entry_count: entry_count,
            entries: entries
        }
    },
    xml: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let xml_first_bytes = view.getUint16(body_offset)
        let xml = data.subarray(body_offset)
        xml = xml_first_bytes == 0xfeff ? xml.toString('utf-16').trim() : xml.toString('utf-8').trim()

        box = {
            ...box,
            xml: xml
        }

        delete box.body_offset
        return box
    },
    bxml: (data, parent = null) => { // DONE
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let xml_data = Array.prototype.slice.call(data.subarray(body_offset))

        box = {
            ...box,
            data: xml_data
        }

        delete box.body_offset
        return box
    },
    pitm: (data, parent = null) => { // DONE
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let item_id = null

        if (box.version == 0) {
            item_id = data.subarray(body_offset, body_offset + 2)
        } else if (box.version == 1) {
            item_id = data.subarray(body_offset, body_offset + 4)
        }

        box = {
            ...box,
            item_id: item_id
        }

        delete box.body_offset
        return box
    },
    fiin: (data, parent = null) => { // DATA
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = view.getUint16(body_offset)
        body_offset += 2

        let children_data = data.subarray(body_offset)

        box = {
            ...box,
            entry_count: entry_count
        }

        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    paen: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    fire: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = null
        let entries = []

        if (box.version == 0) {
            entry_count = view.getUint16(body_offset)
            body_offset += 2
        } else {
            entry_count = view.getUint32(body_offset)
            body_offset += 4
        }

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                item_id: null,
                symbol_count: null
            }

            if (box.version == 0) {
                new_entry.item_id = view.getUint16(body_offset)
                body_offset += 2
            } else {
                new_entry.item_id = view.getUint32(body_offset)
                body_offset += 4
            }

            new_entry.symbol_count = view.getUint32(body_offset)
            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    fpar: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let item_id = null
        let packet_payload_size = null
        let fec_encoding_id = null
        let fec_instance_id = null
        let max_source_block_length = null
        let encoding_symbol_length = null
        let max_number_of_encoding_symbols = null
        let scheme_specific_info = null
        let entries = []

        if (box.version == 0) {
            item_id = view.getUint16(body_offset)
            body_offset += 2
        } else {
            item_id = view.getUint32(body_offset)
            body_offset += 4
        }

        packet_payload_size = view.getUint16(body_offset)
        fec_encoding_id = view.getUint8(body_offset + 2)
        fec_instance_id = view.getUint16(body_offset + 3)
        max_source_block_length = view.getUint16(body_offset + 5)
        encoding_symbol_length = view.getUint16(body_offset + 7)
        max_number_of_encoding_symbols = view.getUint16(body_offset + 9)
        body_offset += 11

        let scheme_specific_info_offset = body_offset
        while (view.getUint8(body_offset) != 0) {
            body_offset++
        }

        scheme_specific_info = data.subarray(scheme_specific_info_offset, body_offset).toString('hex').trim()
        body_offset++

        if (box.version == 0) {
            entry_count = view.getUint16(body_offset)
            body_offset += 2
        } else {
            entry_count = view.getUint32(body_offset)
            body_offset += 4
        }

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                block_count: null,
                block_size: null
            }

            new_entry.block_count = view.getUint16(body_offset)
            new_entry.block_size = view.getUint32(body_offset + 2)
            body_offset += 6
            entries.push(new_entry)
        }

        box = {
            ...box,
            item_id: item_id,
            packet_payload_size: packet_payload_size,
            fec_encoding_id: fec_encoding_id,
            fec_instance_id: fec_instance_id,
            max_source_block_length: max_source_block_length,
            encoding_symbol_length: encoding_symbol_length,
            max_number_of_encoding_symbols: max_number_of_encoding_symbols,
            scheme_specific_info: scheme_specific_info,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    fecr: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = null
        let entries = []

        if (box.version == 0) {
            entry_count = view.getUint16(body_offset)
            body_offset += 2
        } else {
            entry_count = view.getUint32(body_offset)
            body_offset += 4
        }

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                item_id: null,
                symbol_count: null
            }

            if (box.version == 0) {
                new_entry.item_id = view.getUint16(body_offset)
                body_offset += 2
            } else {
                new_entry.item_id = view.getUint32(body_offset)
                body_offset += 4
            }

            new_entry.symbol_count = view.getUint32(body_offset)
            body_offset += 4

            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    segr: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let num_session_groups = null
        let session_groups = null

        num_session_groups = view.getUint16(body_offset)
        body_offset += 2

        for (let i = 0; i < num_session_groups; i++) {
            let new_session_group = {
                entry_count: null,
                entries: [],
                num_channels_in_session_group: null,
                channels_in_session_group: []
            }

            new_session_group.entry_count = view.getUint8(body_offset)
            body_offset += 2

            for (let j = 0; j < new_session_group.entry_count; j++) {
                new_session_group.entries.push(view.getUint32(body_offset))
                body_offset += 4
            }

            new_session_group.num_channels_in_session_group = view.getUint16(body_offset)
            body_offset += 2

            for (let k = 0; k < new_session_group.num_channels_in_session_group; k++) {
                new_session_group.channels_in_session_group.push(view.getUint32(body_offset))
                body_offset += 4
            }

            session_groups.push(new_session_group)
        }

        box = {
            ...box,
            num_session_groups: num_session_groups,
            session_groups: session_groups
        }

        delete box.body_offset
        return box
    },
    gitn: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let entry_count = null
        let entries = []

        entry_count = view.getUint16(body_offset)
        body_offset += 2

        for (let i = 0; i < entry_count; i++) {
            let new_entry = {
                group_id: null,
                group_name: null
            }

            new_entry.group_id = view.getUint32(body_offset)
            body_offset += 4
            let group_name_offset = body_offset

            while (view.getUint8(body_offset) != 0) {
                body_offset++
            }

            new_entry.group_name = data.subarray(group_name_offset, body_offset).toString().trim()
            body_offset++

            entries.push(new_entry)
        }

        box = {
            ...box,
            entry_count: entry_count,
            entries: entries
        }

        delete box.body_offset
        return box
    },
    idat: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let data_array = Array.prototype.slice.call(data.subarray(body_offset))

        box = {
            ...box,
            data: data_array
        }

        delete box.body_offset
        return box
    },
    iref: (data, parent = null) => { // DONE
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let references = []
        references = create_box_tree(data.subarray(body_offset), box)
        box.children = references
        delete box.body_offset
        return box
    },
    hint: (data, parent) => {
        if (parent.type == 'iref' && parent.version == 0) {
            return single_item_type_reference_box(data, parent)
        } else if (parent.type == 'iref' && parent.version == 1) {
            return single_item_type_reference_box_large(data, parent)
        }
    },
    cdsc: (data, parent) => {
        if (parent.type == 'iref' && parent.version == 0) {
            return single_item_type_reference_box(data, parent)
        } else if (parent.type == 'iref' && parent.version == 1) {
            return single_item_type_reference_box_large(data, parent)
        }
    },
    font: (data, parent) => {
        if (parent.type == 'iref' && parent.version == 0) {
            return single_item_type_reference_box(data, parent)
        } else if (parent.type == 'iref' && parent.version == 1) {
            return single_item_type_reference_box_large(data, parent)
        }
    },
    hind: (data, parent) => {
        if (parent.type == 'iref' && parent.version == 0) {
            return single_item_type_reference_box(data, parent)
        } else if (parent.type == 'iref' && parent.version == 1) {
            return single_item_type_reference_box_large(data, parent)
        }
    },
    vdep: (data, parent) => {
        if (parent.type == 'iref' && parent.version == 0) {
            return single_item_type_reference_box(data, parent)
        } else if (parent.type == 'iref' && parent.version == 1) {
            return single_item_type_reference_box_large(data, parent)
        }
    },
    vplx: (data, parent) => {
        if (parent.type == 'iref' && parent.version == 0) {
            return single_item_type_reference_box(data, parent)
        } else if (parent.type == 'iref' && parent.version == 1) {
            return single_item_type_reference_box_large(data, parent)
        }
    },
    subt: (data, parent) => {
        if (parent.type == 'iref' && parent.version == 0) {
            return single_item_type_reference_box(data, parent)
        } else if (parent.type == 'iref' && parent.version == 1) {
            return single_item_type_reference_box_large(data, parent)
        }
    },
    single_item_type_reference_box: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let from_item_id = null
        let reference_count = null
        let references = []

        from_item_id = view.getUint16(body_offset)
        body_offset += 2

        reference_count = view.getUint16(body_offset)
        body_offset += 2

        for (let i = 0; i < reference_count; i++) {
            references.push(view.getUint16(body_offset))
            body_offset += 2
        }

        box = {
            ...box,
            from_item_id: from_item_id,
            reference_count: reference_count,
            references: references
        }

        delete box.body_offset
        return box
    },
    single_item_type_reference_box_large: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let from_item_id = null
        let reference_count = null
        let references = []

        from_item_id = view.getUint32(body_offset)
        body_offset += 4

        reference_count = view.getUint16(body_offset)
        body_offset += 2

        for (let i = 0; i < reference_count; i++) {
            references.push(view.getUint32(body_offset))
            body_offset += 4
        }

        box = {
            ...box,
            from_item_id: from_item_id,
            reference_count: reference_count,
            references: references
        }

        delete box.body_offset
        return box
    },
    meco: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    mere: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let first_metabox_handler_type = null
        let second_metabox_handler_type = null
        let metabox_relation = null

        first_metabox_handler_type = view.getUint32(body_offset)
        second_metabox_handler_type = view.getUint32(body_offset + 4)
        metabox_relation = view.getUint8(body_offset + 5)

        box = {
            ...box,
            first_metabox_handler_type: first_metabox_handler_type,
            second_metabox_handler_type: second_metabox_handler_type,
            metabox_relation: metabox_relation
        }

        delete box.body_offset
        return box
    },
    styp: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let major_brand = data.subarray(body_offset, body_offset + 4).toString().trim()
        let minor_version = view.getUint32(body_offset + 4)
        let compatible_brands = []

        body_offset += 8

        for (let i = 0; i < view.byteLength - body_offset; i += 4) {
            compatible_brands.push(data.subarray(body_offset + i, body_offset + i + 4).toString().trim())
        }

        box = {
            ...box,
            major_brand: major_brand,
            minor_version: minor_version,
            compatible_brands: compatible_brands
        }

        delete box.body_offset
        return box
    },
    sidx: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let reference_id = null
        let timescale = null
        let earliest_presentation_time = null
        let first_offset = null
        let reference_count = null
        let references = []

        reference_id = view.getUint32(body_offset)
        timescale = view.getUint32(body_offset + 4)

        if (box.version == 0) {
            earliest_presentation_time = view.getUint32(body_offset)
            first_offset = view.getUint32(body_offset + 4)
            body_offset += 8
        } else {
            earliest_presentation_time = view.getBigUint64(body_offset)
            first_offset = view.getBigUint64(body_offset + 8)
            body_offset += 16
        }

        reference_count = view.getUint16(body_offset + 10)
        body_offset += 12

        for (let i = 0; i < reference_count; i++) {
            let new_reference = {
                reference_type: null,
                referenced_size: null,
                subsegment_duration: null,
                starts_with_sap: null,
                sap_type: null,
                sap_delta_time: null
            }

            new_reference.reference_type = view.getUint8(body_offset) >> 7
            new_reference.referenced_size = view.getUint32(body_offset) & 0x7fffffff
            new_reference.subsegment_duration = view.getUint32(body_offset + 4)
            new_reference.starts_with_sap = view.getUint8(body_offset + 8) >> 7
            new_reference.sap_type = (view.getUint8(body_offset + 8) >> 4) & 0x07
            new_reference.sap_delta_time = view.getUint32(body_offset + 8) & 0x0fffffff
            body_offset += 12

            references.push(new_reference)
        }

        box = {
            ...box,
            reference_id: reference_id,
            timescale: timescale,
            earliest_presentation_time: earliest_presentation_time ? earliest_presentation_time.toString() : earliest_presentation_time,
            first_offset: first_offset ? first_offset.toString() : first_offset,
            reference_count: reference_count,
            references: references
        }

        delete box.body_offset
        return box
    },
    ssix: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let subsegments = []
        let subsegment_count = view.getUint32(body_offset)
        body_offset += 4

        for (let i = 0; i < subsegment_count; i++) {
            let new_subsegment = {
                level: null,
                range_size: null
            }

            new_subsegment.level = view.getUint8(body_offset)
            new_subsegment.range_size = view.getUint32(body_offset) & 0x00ffffff
            body_offset += 4

            subsegments.push(new_subsegment)
        }

        box = {
            ...box,
            subsegment_count: subsegment_count,
            subsegments: subsegments
        }

        delete box.body_offset
        return box
    },
    prft: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0, 1])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let reference_track_id = null
        let ntp_timestamp = null
        let media_time = null

        reference_track_id = view.getUint32(body_offset)
        ntp_timestamp = view.getBigUint64(body_offset + 4)
        body_offset += 12

        if (box.version == 0) {
            media_time = view.getUint32(body_offset)
            body_offset += 4
        } else {
            media_time = view.getBigUint64(body_offset)
            body_offset += 8
        }

        box = {
            ...box,
            reference_track_id: reference_track_id,
            ntp_timestamp: ntp_timestamp ? ntp_timestamp.toString(): ntp_timestamp,
            media_time: media_time ? media_time.toString() : media_time
        }

        delete box.body_offset
        return box
    },
    cinf: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset
        let children_data = data.subarray(body_offset)

        box = {
            ...box,
            original_format: create_box_tree(children_data, box)
        }

        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    feci: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let fec_encoding_id = null
        let fec_instance_id = null
        let source_block_number = null
        let encoding_symbol_id = null

        fec_encoding_id = view.getUint8(body_offset)
        fec_instance_id = view.getUint16(body_offset + 1)
        source_block_number = view.getUint16(body_offset + 3)
        encoding_symbol_id = view.getUint16(body_offset + 5)

        box = {
            ...box,
            fec_encoding_id: fec_encoding_id,
            fec_instance_id: fec_instance_id,
            source_block_number: source_block_number,
            encoding_symbol_id: encoding_symbol_id
        }

        delete box.body_offset
        return box
    },
    extr: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_box(data)
        let body_offset = box.body_offset

        let extra_data = []
        let feci_type = null
        let feci_size = null
        let children_data = null
        let feci = []

        feci_type = data.subarray(body_offset + 4, body_offset + 8).toString().trim()

        if (feci_type == 'feci') {
            feci_size = view.getUint32(body_offset)
            feci_largesize = view.getBigUint64(body_offset + 8)
            children_data = data.subarray(body_offset)
            feci = create_box_tree(children_data, box)

            if(feci_size == 1){
                body_offset = BigInt(body_offset) + feci_largesize
            }else{
                body_offset += feci_size
            }
        }

        extra_data = Array.prototype.slice.call(data.subarray(Number(body_offset)))
        box.feci = feci
        box.extra_data = extra_data
        delete box.body_offset
        return box
    },
    chnl: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let stream_structure = null
        let defined_layout = null
        let channels = []
        let omitted_channels_map = null
        let object_count = null

        stream_structure = view.getUint8(body_offset)
        body_offset++

        if (stream_structure == 1) {
            defined_layout = view.getUint8(body_offset)
            body_offset++

            if (defined_layout == 0) {
                for (let i = 0; i < parent.channel_count; i++) {
                    let new_channel = {
                        speaker_position: null,
                        azimuth: null,
                        elevation: null
                    }

                    new_channel.speaker_position = view.getUint8(body_offset)
                    body_offset++

                    if (new_channel.speaker_position == 126) {
                        new_channel.azimuth = view.getUint16(body_offset)
                        new_channel.elevation = view.getUint8(body_offset + 2)
                        body_offset += 3
                    }

                    channels.push(new_channel)
                }
            } else {
                omitted_channels_map = view.getBigUint64(body_offset)
                body_offset += 8
            }
        } else if (stream_structure == 2) {
            object_count = view.getUint8(body_offset)
            body_offset++
        }

        box = {
            ...box,
            stream_structure: stream_structure,
            defined_layout: defined_layout,
            channels: channels,
            omitted_channels_map: omitted_channels_map ? omitted_channels_map.toString() : omitted_channels_map,
            object_count: object_count
        }

        delete box.body_offset
        return box
    },
    dmix: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset
        let accepted_versions = new Set([0])

        if (!accepted_versions.has(box.version)) {
            return {}
        }

        let target_layout = null
        let target_channel_count = null
        let in_stream = null
        let downmix_id = null
        let target_channels = []

        target_layout = view.getUint8(body_offset)
        target_channel_count = view.getUint8(body_offset + 1) & 0x7f
        downmix_id = view.getUint8(body_offset + 2) & 0x7f

        if (in_stream == 0) {
            for (let i = 0; i < target_channel_count; i++) {
                let new_target_channel = {
                    base_channels: []
                }

                for (let j = 0; j < parent.base_channel_count; j++) {
                    if (j % 2) {
                        new_target_channel.base_channels.push(view.getUint8(body_offset) >> 4)
                    } else {
                        new_target_channel.base_channels.push(view.getUint8(body_offset) & 0x0f)
                        body_offset++
                    }
                }

                target_channels.push(new_target_channel)
            }
        }

        box = {
            ...box,
            target_layout: target_layout,
            target_channel_count: target_channel_count,
            in_stream: in_stream,
            downmix_id: downmix_id,
            target_channels: target_channels
        }

        delete box.body_offset
        return box
    },
    ludt: (data, parent = null) => { // DONE
        let box = create_box(data)
        let body_offset = box.body_offset

        let children_data = data.subarray(body_offset)
        box.children = create_box_tree(children_data, box)
        delete box.body_offset
        return box
    },
    tlou: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset

        let downmix_id = null
        let drc_set_id = null
        let bs_sample_peak_level = null
        let bs_true_peak_level = null
        let measurement_system_for_tp = null
        let reliability_for_tp = null
        let measurement_count = null
        let measurements = []

        downmix_id = (view.getUint16(body_offset) >> 6) & 0x007f
        drc_set_id = view.getUint16(body_offset) & 0x003f
        bs_sample_peak_level = view.getInt16(body_offset + 2) >> 4
        bs_true_peak_level = (view.getInt32(body_offset + 2) >> 8) & 0x00000fff
        measurement_system_for_tp = (view.getUint32(body_offset + 2) >> 4) & 0x0000000f
        reliability_for_tp = view.getUint32(body_offset + 2) & 0x0000000f
        measurement_count = view.getUint8(body_offset + 6)
        body_offset += 7

        for (let i = 0; i < measurement_count; i++) {
            let new_measurement = {
                method_definition: null,
                method_value: null,
                measurement_system: null,
                reliability: null
            }

            new_measurement.method_definition = view.getUint8(body_offset)
            new_measurement.method_value = view.getUint8(body_offset + 1)
            new_measurement.measurement_system = view.getUint8(body_offset + 2) >> 4
            new_measurement.reliability = view.getUint8(body_offset + 2) & 0x0f
            body_offset += 3

            measurements.push(new_measurement)
        }

        box = {
            ...box,
            downmix_id: downmix_id,
            drc_set_id: drc_set_id,
            bs_sample_peak_level: bs_sample_peak_level,
            bs_true_peak_level: bs_true_peak_level,
            measurement_system_for_tp: measurement_system_for_tp,
            reliability_for_tp: reliability_for_tp,
            measurement_count: measurement_count,
            measurements: measurements
        }

        delete box.body_offset
        return box
    },
    alou: (data, parent = null) => { // DONE
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let box = create_full_box(data)
        let body_offset = box.body_offset

        let downmix_id = null
        let drc_set_id = null
        let bs_sample_peak_level = null
        let bs_true_peak_level = null
        let measurement_system_for_tp = null
        let reliability_for_tp = null
        let measurement_count = null
        let measurements = []

        downmix_id = (view.getUint16(body_offset) >> 6) & 0x007f
        drc_set_id = view.getUint16(body_offset) & 0x003f
        bs_sample_peak_level = view.getInt16(body_offset + 2) >> 4
        bs_true_peak_level = (view.getInt32(body_offset + 2) >> 8) & 0x00000fff
        measurement_system_for_tp = (view.getUint32(body_offset + 2) >> 4) & 0x0000000f
        reliability_for_tp = view.getUint32(body_offset + 2) & 0x0000000f
        measurement_count = view.getUint8(body_offset + 6)
        body_offset += 7

        for (let i = 0; i < measurement_count; i++) {
            let new_measurement = {
                method_definition: null,
                method_value: null,
                measurement_system: null,
                reliability: null
            }

            new_measurement.method_definition = view.getUint8(body_offset)
            new_measurement.method_value = view.getUint8(body_offset + 1)
            new_measurement.measurement_system = view.getUint8(body_offset + 2) >> 4
            new_measurement.reliability = view.getUint8(body_offset + 2) & 0x0f
            body_offset += 3

            measurements.push(new_measurement)
        }

        box = {
            ...box,
            downmix_id: downmix_id,
            drc_set_id: drc_set_id,
            bs_sample_peak_level: bs_sample_peak_level,
            bs_true_peak_level: bs_true_peak_level,
            measurement_system_for_tp: measurement_system_for_tp,
            reliability_for_tp: reliability_for_tp,
            measurement_count: measurement_count,
            measurements: measurements
        }

        delete box.body_offset
        return box
    },
    roll: (data, parent = null) => {
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let body_offset = 0
        let roll_distance = view.getUint16(body_offset)

        return{
            roll_distance: roll_distance
        }
    },
    prol: (data, parent = null) => {
        let view = new DataView(data.buffer, data.byteOffset, data.length)
        let body_offset = 0
        let roll_distance = view.getUint16(body_offset)

        return{
            roll_distance: roll_distance
        }
    },
    alst: (data, parent = null) => {},
    rap: (data, parent = null) => {},
    tele: (data, parent = null) => {},
    sample_entry: (data, parent = null) => {},
    btrt: (data, parent = null) => {},
    visual_sample_entry: (data, parent = null) => {},
    audio_sample_entry: (data, parent = null) => {},
    audio_sample_entry_v1: (data, parent = null) => {
        return audio_sample_entry(data,parent)
    },
    meta_data_sample_entry: (data, parent = null) => {},
    metx: (data, parent = null) => {
        return meta_data_sample_entry(data,parent)
    },
    txtC: (data, parent = null) => {},
    mett: (data, parent = null) => {
        return meta_data_sample_entry(data,parent)
    },
    uri: (data, parent = null) => {},
    uriI: (data, parent = null) => {},
    urim: (data, parent = null) => {
        return meta_data_sample_entry(data,parent)
    },
    hint_sample_entry: (data, parent = null) => {},
    plain_text_sample_entry: (data, parent = null) => {},
    simple_text_sample_entry: (data, parent = null) => {
        return plain_text_sample_entry(data,parent)
    },
    subtitle_sample_entry: (data, parent = null) => {},
    stpp: (data, parent = null) => {},
    sbtt: (data, parent = null) => {},
    font_sample_entry: (data, parent = null) => {},
    tims: (data, parent = null) => {},
    tsro: (data, parent = null) => {},
    snro: (data, parent = null) => {},
    fdsa: (data, parent = null) => {},
    fdpa: (data, parent = null) => {},
    lct_header_template: (data, parent = null) => {},
    lct_header_extension: (data, parent = null) => {},
    rrtp: (data, parent = null) => {},
    rsrp: (data, parent = null) => {},
    rssr: (data, parent = null) => {},
    clap: (data, parent = null) => {},
    pasp: (data, parent = null) => {},
    srat: (data, parent = null) => {},
    icpv: (data, parent = null) => {},
    rtp_sample: (data, parent = null) => {},
    rtp_packet: (data, parent = null) => {},
    rtp_constructor: (data, parent = null) => {},
    rtp_noopconstructor: (data, parent = null) => {},
    rtp_immediateconstructor: (data, parent = null) => {},
    rtp_sample_constructor: (data, parent = null) => {},
    rtp_sample_description_constructor: (data, parent = null) => {},
    hnti: (data, parent = null) => {},
    rtp: (data, parent = null) => {},
    sdp: (data, parent = null) => {},
    trpy: (data, parent = null) => {},
    nump: (data, parent = null) => {},
    tpyl: (data, parent = null) => {},
    totl: (data, parent = null) => {},
    npck: (data, parent = null) => {},
    tpay: (data, parent = null) => {},
    maxr: (data, parent = null) => {},
    dmed: (data, parent = null) => {},
    dimm: (data, parent = null) => {},
    drep: (data, parent = null) => {},
    tmin: (data, parent = null) => {},
    tmax: (data, parent = null) => {},
    pmax: (data, parent = null) => {},
    dmax: (data, parent = null) => {},
    payt: (data, parent = null) => {},
    fdp: (data, parent = null) => {},
    fd_constructor: (data, parent = null) => {},
    fd_noopconstructor: (data, parent = null) => {},
    fd_immediateconstructor: (data, parent = null) => {},
    fd_sample_constructor: (data, parent = null) => {},
    fd_item_constructor: (data, parent = null) => {},
    fd_item_constructor_large: (data, parent = null) => {},
    fd_xml_box_constructor: (data, parent = null) => {},
    rm2t: (data, parent = null) => {},
    sm2t: (data, parent = null) => {},
    mpeg2_ts_sample_entry: (data, parent = null) => {},
    tPAT: (data, parent = null) => {},
    tPMT: (data, parent = null) => {},
    tOD: (data, parent = null) => {},
    tsti: (data, parent = null) => {},
    istm: (data, parent = null) => {},
    mpeg2_ts_constructor: (data, parent = null) => {},
    mpeg2_ts_immediate_constructor: (data, parent = null) => {},
    mpeg2_ts_sample_constructor: (data, parent = null) => {},
    mpeg2_ts_packet_representation: (data, parent = null) => {},
    mpeg2_ts_sample: (data, parent = null) => {},
    pm2t: (data, parent = null) => {},
    tssy: (data, parent = null) => {},
    rtpx: (data, parent = null) => {},
    rcsr: (data, parent = null) => {},
    received_rtcp_packet: (data, parent = null) => {},
    received_rtcp_sample: (data, parent = null) => {},
    ccid: (data, parent = null) => {},
    sroc: (data, parent = null) => {},
    prtp: (data, parent = null) => {},
    rash: (data, parent = null) => {},
    sap: (data, parent = null) => {},
    colr: (data, parent = null) => {},
    loudness_base_box: (data, parent = null) => {},
    stxt: (data, parent = null) => {},
}

module.exports = {
    tree: create_box_tree
}
