// =====ALGO VARS=====
const box_cost = 5;
const road_cost = 1;
const max_loops = 1000;
const bomb_time = 3500;
const human_cure = 2500;
const radius = 1;
const surround_factor = 0.5;
const enable_v2 = false;
const low_box_factor = 1;
const high_box_factor = 1.5;
const bomb_explosion_duration = 1000;

var slice_factor = 1;
var box_factor = high_box_factor;

// =====DEBUG=====
var prev_pos = null;
var prev_count = 0;
var pause = false;
var prev_bomb = null;

// =====HANDLE GAME VARS=====
var current_state = null;
var next_bomb_stamp = null;
var is_moving = false;
var start_game_stamp = null;

var mprofile = null;
var oprofile = null;
var mpower = null;
var mspeed = null;
var mdelay = null;
var mpill = null;
var mlives = null;
var mloc = null;
var opower = null;
var ospeed = null;
var odelay = null;
var opill = null;
var olives = null;
var oloc = null;

function drive_player(direction, custom) {
    if(is_moving)
        return;
    if(direction.length == 0)
        return;
    if(direction[0] == 'b') {
        if(next_bomb_stamp == null || Date.now() > next_bomb_stamp) {
            is_moving = true;
            socket.emit('drive player', {direction: 'b'});
        } else {
            socket.emit('drive player', {direction: 'x'});
        }
        return;
    }
    is_moving = true;
    direction = direction.split("b")[0];
    console.log(`${custom}: ${direction} from ${mloc}`);
    socket.emit('drive player', {direction: direction});
}

function update_game() {
    if(playerId.startsWith(gameData.map_info.players[0].id)) {
        mprofile = gameData.map_info.players[0];
        oprofile = gameData.map_info.players[1];
    } else {
        mprofile = gameData.map_info.players[1];
        oprofile = gameData.map_info.players[0];
    }

    mpower = mprofile.power;
    mspeed = mprofile.speed/60;
    mdelay = mprofile.delay;
    mpill = mprofile.pill;
    mlives = mprofile.lives;
    mloc = [mprofile.currentPosition.col, mprofile.currentPosition.row];

    opower = oprofile.power;
    ospeed = oprofile.speed/60;
    odelay = oprofile.delay;
    opill = oprofile.pill;
    olives = oprofile.lives;
    oloc = [oprofile.currentPosition.col, oprofile.currentPosition.row];
}

function auto() {
    if(pause)
        return;
    // if(mlives == 1) {
    //     slice_factor = 1;
    // } else {
    //     slice_factor = 2;
    // }
    document.getElementById('moving-status').innerHTML = is_moving;
    if(is_moving) {
        if(prev_pos == null) {
            prev_pos = clone(mloc);
            return;
        }
        if (equal_coor(mloc, prev_pos)) {
            prev_count++;
        } else {
            prev_count = 0;
        }
        prev_pos = clone(mloc);
        if(prev_count > 4)
            is_moving = false;
        return;
    }
    // socket.emit('drive player', {direction: 'x'});
    current_state = format_state(gameData.map_info, gameData.timestamp);
    if(current_state.map[mloc[1]][mloc[0]] >= 998) {
        var fpath = translate(go_to_safe(current_state, mloc)).slice(0, slice_factor);
        if(fpath.includes('b'))
            return;
        drive_player(fpath, 'go_to_safe');
    } else {
        var spoils = spoil_list(current_state);
        var boxes = box_list(current_state);
        if(boxes.length == 0 && spoils.length == 0)
            return;
        if (boxes.length != 0 && (spoils.length == 0 || boxes[0].ratio > spoils[0].ratio)) {
            if(equal_coor(mloc, [boxes[0].col, boxes[0].row])) {
                if(find_safe_square(current_state, mloc, mpower) == null)
                    return;
                if(next_bomb_stamp == null || Date.now() > next_bomb_stamp)
                    drive_player('b', 'box_destroyer');
                return;
            }

            var path = astar(current_state, mloc, [boxes[0].col, boxes[0].row]);
            if(path == null)
                return;
            var fpath = path.reduce((p, c) => {return p + c.action}, "");
            // if(translate(fpath)[0] == 'b') {
            //     if(next_bomb_stamp == null || Date.now() > next_bomb_stamp)
            //         drive_player(translate(fpath)[0], 'box_destroyer');
            // } else {
                drive_player(translate(fpath).slice(0, slice_factor), 'move_to_box');
            // }
            return;
        }
        var path = astar(current_state, mloc, [spoils[0].col, spoils[0].row]);
        if(path == null)
            return;
        var fpath = path.reduce((p, c) => {return p + c.action}, "");
        // if(translate(fpath)[0] == 'b') {
        //     if(next_bomb_stamp == null || Date.now() > next_bomb_stamp)
        //         drive_player('b', 'box_destroyer');
        // } else {
            drive_player(translate(fpath).slice(0, slice_factor), 'move_to_spoil');
        // }
    }
}

// =====PATHFINDING=====
function Node(parent, location, action, map) {
    return {
        parent: parent,
        location: location,
        action: action,
        map: map,
        h: 0,
        g: 0,
        f: 0
    };
}

function get_path(node) {
    var path = [];

    while (node.parent) {
        path.push(node);
        node = node.parent;
    }

    return path;
}

function get_path_actions(path) {
    var actions = [];

    for (const node of path)
        actions.push(node.action);

    return actions;
}

function astar(game_state, start, target) {
    var path = [];

    var open_list = [Node(null, start, null, clone(game_state))];
    var closed_list = [];

    var counter = 0;
    while (open_list.length > 0 && counter <= max_loops) {
        // Simulate priority queue
        var curr_node = open_list[0];
        var curr_index = 0;
        for (const [index, node] of open_list.entries()) {
            if (node.f < curr_node.f) {
                curr_node = node;
                curr_index = index;
            }
        }

        // Found target
        if (equal_coor(curr_node.location, target)) {
            path = get_path(curr_node);
            return path.reverse();
        }

        // Remove current node from active list
        open_list.splice(curr_index, 1);
        closed_list.push(curr_node);

        // get neighbors of current node
        var neighbors = get_free_neighbors(curr_node.map, curr_node.location);
        var neighbor_nodes = [];
        for (const neighbor of neighbors) {
            neighbor_nodes.push(Node(null, neighbor[0], neighbor[1], neighbor[2]));
        }

        for (const neighbor of neighbor_nodes) {
            var in_closed = false;
            var will_add = true;
            
            for (const [index, node] of closed_list.entries()) {
                if (equal_coor(neighbor.location, node.location)) {
                    in_closed = true;
                    break;
                }
            }

            if(in_closed)
                continue;

            // cost = g(current) + movementcost(current, neighbor)
            var cost = curr_node.g + neighbor.action.replaceAll("b", "").length;

            // remove old pending node if current is better
            for (const [index, node] of open_list.entries()) {
                if (equal_coor(neighbor.location, node.location)) {
                    if(cost < node.g) {
                        open_list.splice(index, 1);
                        will_add = true;
                    } else {
                        will_add = false;
                    }
                    break;
                }
            }

            if (will_add) {
                neighbor.g = cost;
                neighbor.h = manhattan_distance(neighbor.location, target);
                neighbor.f = neighbor.g + neighbor.h;
                neighbor.parent = curr_node;
                open_list.push(neighbor);
            }
        }

        counter += 1;
    }
    return null;
}

function get_free_neighbors(game_state, location) {
    var [x, y] = location;
    var neighbors = [[[x-1, y], 'l'], [[x+1, y], 'r'], [[x, y+1], 'd'], [[x, y-1], 'u']];
    var free_neighbors = [];

    for (const neighbor of neighbors) {
        var tile = neighbor[0];
        var direction = neighbor[1];
        if (is_in_bounds(game_state, tile)) {
            if (!is_occupied(game_state, tile)) {
                if(game_state.map[tile[1]][tile[0]] == 2) {
                    var safe_path = find_safe_square(game_state, location, mpower);
                    if(safe_path == null)
                        continue;

                    var run = "";
                    for (const step of safe_path)
                        run += step[1];
                    var back = back_path(run);
                    
                    var new_state = send_bomb(game_state, location, mpower);
                    free_neighbors.push([tile, "b" + run + back + direction, new_state]);
                } else {
                    free_neighbors.push([tile, direction, game_state]);
                }
            }
        }
    }

    return free_neighbors;
}

function manhattan_distance(start, end) {
    var distance = Math.abs(start[0] - end[0]) + Math.abs(start[1] - end[1]);
    return distance;
}


function is_in_bounds(game_state, tile) {
    return (tile[0] >= 0 && tile[0] < game_state.size.cols)
    && (tile[1] >= 0 && tile[1] < game_state.size.rows);
}

function is_occupied(game_state, tile) {
    if(prev_bomb && prev_bomb[tile[1]][tile[0]] > Date.now())
        return true;
    return [1, 6, 998, 999, 1000].includes(game_state.map[tile[1]][tile[0]]);
}

function equal_coor(a, b) {
    return (a[0] == b[0]) && (a[1] == b[1]);
}

function is_box(game_state, tile) {
    return game_state.map[tile[1]][tile[0]] == 2;
}

function bomb_sim(game_state, location, power) {
    var result = clone(game_state);
    var [x, y] = location;
    for(var i = x; i >= 0 && i >= x - power; i--) {
        if(result.map[y][i] == 1)
            break;
        if(result.map[y][i] == 2) {
            result.map[y][i] = 998;
            break;
        }
        if(result.map[y][i] != 6)
            result.map[y][i] = 999;
    }
        
    for(var i = x; i < result.size.cols && i <= x + power; i++) {
        if(result.map[y][i] == 1)
            break;
        if(result.map[y][i] == 2) {
            result.map[y][i] = 998;
            break;
        }
        if(result.map[y][i] != 6)
            result.map[y][i] = 999;
    }

    for(var i = y; i >= 0 && i >= y - power; i--) {
        if(result.map[i][x] == 1)
            break;
        if(result.map[i][x] == 2) {
            result.map[i][x] = 998;
            break;
        }
        if(result.map[i][x] != 6)
            result.map[i][x] = 999;
    }

    for(var i = y; i < result.size.rows && i <= y + power; i++) {
        if(result.map[i][x] == 1)
            break;
        if(result.map[i][x] == 2) {
            result.map[i][x] = 998;
            break;
        }
        if(result.map[i][x] != 6)
            result.map[i][x] = 999;
    }

    result.map[y][x] = 998;

    return result;
}

function send_bomb(game_state, location, power) {
    var result = clone(game_state);
    var [x, y] = location;
    for(var i = x; i >= 0 && i >= x - power; i--) {
        if(result.map[y][i] == 1)
            break;
        if(result.map[y][i] == 2) {
            result.map[y][i] = 0;
            break;
        }
    }
        
    for(var i = x; i < result.size.cols && i <= x + power; i++) {
        if(result.map[y][i] == 1)
            break;
        if(result.map[y][i] == 2) {
            result.map[y][i] = 0;
            break;
        }
    }

    for(var i = y; i >= 0 && i >= y - power; i--) {
        if(result.map[i][x] == 1)
            break;
        if(result.map[i][x] == 2) {
            result.map[i][x] = 0;
            break;
        }
    }

    for(var i = y; i < result.size.rows && i <= y + power; i++) {
        if(result.map[i][x] == 1)
            break;
        if(result.map[i][x] == 2) {
            result.map[i][x] = 0;
            break;
        }
    }

    return result;
}

function find_safe_square(game_state, location, power) {
    const queue = [[location, 0]];
    const visited = new Map();
    visited.set(location.toString(), null);
    var simulated = bomb_sim(game_state, location, power);
    
    for (let [curr, distance] of queue) {
        if (simulated.map[curr[1]][curr[0]] == 0 && ((distance + 1)/mspeed < 2)) {
            let path = [];
            while (curr) {
                var temp = [curr];
                if(visited.get(curr.toString()) == null)
                    break;
                [curr, action] = visited.get(curr.toString());
                temp.push(action);
                path.push(temp);
            }
            return path.reverse();
        }

        var neighbors = get_free_neighbors_2(simulated, curr, true);
        for (let [adj, action] of neighbors) {
            if (visited.has(adj.toString()))
                continue;
            visited.set(adj.toString(), [curr, action]);
            queue.push([adj, distance + 1]);
        }
    }
    
    return null;
}

function get_free_neighbors_2(game_state, location, strict_bomb) {
    var [x, y] = location;
    var neighbors = [[[x-1, y], 'l'], [[x+1, y], 'r'], [[x, y+1], 'd'], [[x, y-1], 'u']];
    var free_neighbors = [];

    for (const neighbor of neighbors) {
        var tile = neighbor[0];
        var direction = neighbor[1];
        if (is_in_bounds(game_state, tile)) {
            if (!is_occupied_2(game_state, tile, strict_bomb)) {
                free_neighbors.push([tile, direction]);
            }
        }
    }

    return free_neighbors;
}

function is_occupied_2(game_state, tile, strict_bomb) {
    if(strict_bomb && prev_bomb && prev_bomb[tile[1]][tile[0]] > Date.now())
        return true;
    if(game_state.map[tile[1]][tile[0]] == 999 && strict_bomb) {
        if(game_state.bomb_map[tile[1]][tile[0]])
            return true;
        else
            return false;
    }
    if(game_state.map[tile[1]][tile[0]] == 999 && game_state.bomb_map[tile[1]][tile[0]]) {
        if((game_state.bomb_map[tile[1]][tile[0]] - (Date.now() - game_state.timestamp)) < bomb_time/mspeed)
            return true;
        else
            return false;
    }
    return [1, 2, 6, 998, 1000].includes(game_state.map[tile[1]][tile[0]]);
}

function back_path(path) {
    const inv = {
        "l": "r",
        "r": "l",
        "u": "d",
        "d": "u"
    }
    var res = "";
    for(var i = path.length - 1; i >= 0; i--)
        res += inv[path[i]];
    return res;
}

function clone(obj) {
    var copy;

    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        copy = [];
        for (var i = 0, len = obj.length; i < len; i++) {
            copy[i] = clone(obj[i]);
        }
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        copy = {};
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
        }
        return copy;
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
}

function translate(path) {
    const dict = {
        'l': '1',
        'r': '2',
        'u': '3',
        'd': '4',
        'b': 'b'
    }

    var res = "";
    for(var i = 0; i < path.length; i++)
        res += dict[path[i]];
    return res;
}

function format_state(game_state, timestamp) {
    var res = clone(game_state);
    if(prev_bomb == null) {
        prev_bomb = Array.from(Array(game_state.size.rows), () => Array.from(Array(game_state.size.cols), () => 0));
    }
    res.bomb_map = Array.from(Array(game_state.size.rows), () => new Array(game_state.size.cols));
    res.plague_map = Array.from(Array(game_state.size.rows), () => new Array(game_state.size.cols));
    res.timestamp = timestamp;
    for(const bomb of res.bombs) {
        var power = null;
        if (bomb.playerId.startsWith(res.players[0].id) || res.players[0].id.startsWith(bomb.playerId) || bomb.playerId == res.players[0].id)
            power = res.players[0].power;
        else
            power = res.players[1].power;
        res = bomb_block(res, [bomb.col, bomb.row], power, bomb.remainTime);
    }

    res.map[oloc[1]][oloc[0]] = 1;

    for(const human of res.human.filter(h => h.infected)) {
        res = danger(res, human);
    }
    for(const virus of res.viruses) {
        res = danger(res, virus);
    }

    res = format_plague(res);
    // res = spoil_list_to_2d(res, res.spoils);
    // res = human_list_to_2d(res, res.human);
    // res = virus_list_to_2d(res, res.viruses);
    // res = plague_list_to_2d_human(res, res.human);
    // res = plague_list_to_2d_virus(res, res.viruses);
    res = gen_sum_of_spoil(res);

    return res;
}

function bomb_block(game_state, location, power, remainTime) {
    var result = clone(game_state);
    var [x, y] = location;
    for(var i = x; i >= 0 && i >= x - power; i--) {
        if(result.map[y][i] == 1)
            break;
        if(result.map[y][i] == 2) {
            result.map[y][i] = 998;
            prev_bomb[y][i] = Date.now() + remainTime - (Date.now() - game_state.timestamp) + bomb_explosion_duration;
            break;
        }
        if(result.map[y][i] != 6)
            result.map[y][i] = 999;
        result.bomb_map[y][i] = remainTime;
        prev_bomb[y][i] = Date.now() + remainTime - (Date.now() - game_state.timestamp) + bomb_explosion_duration;
    }
        
    for(var i = x; i < result.size.cols && i <= x + power; i++) {
        if(result.map[y][i] == 1)
            break;
        if(result.map[y][i] == 2) {
            result.map[y][i] = 998;
            prev_bomb[y][i] = Date.now() + remainTime - (Date.now() - game_state.timestamp) + bomb_explosion_duration;
            break;
        }
        if(result.map[y][i] != 6)
            result.map[y][i] = 999;
        result.bomb_map[y][i] = remainTime;
        prev_bomb[y][i] = Date.now() + remainTime - (Date.now() - game_state.timestamp) + bomb_explosion_duration;
    }

    for(var i = y; i >= 0 && i >= y - power; i--) {
        if(result.map[i][x] == 1)
            break;
        if(result.map[i][x] == 2) {
            result.map[i][x] = 998;
            prev_bomb[i][x] = Date.now() + remainTime - (Date.now() - game_state.timestamp) + bomb_explosion_duration;
            break;
        }
        if(result.map[i][x] != 6)
            result.map[i][x] = 999;
        result.bomb_map[i][x] = remainTime;
        prev_bomb[i][x] = Date.now() + remainTime - (Date.now() - game_state.timestamp) + bomb_explosion_duration;
    }

    for(var i = y; i < result.size.rows && i <= y + power; i++) {
        if(result.map[i][x] == 1)
            break;
        if(result.map[i][x] == 2) {
            result.map[i][x] = 998;
            prev_bomb[i][x] = Date.now() + remainTime - (Date.now() - game_state.timestamp) + bomb_explosion_duration;
            break;
        }
        if(result.map[i][x] != 6)
            result.map[i][x] = 999;
        result.bomb_map[i][x] = remainTime;
        prev_bomb[i][x] = Date.now() + remainTime - (Date.now() - game_state.timestamp) + bomb_explosion_duration;
    }
    result.map[y][x] = 998;
    return result;
}

function danger(game_state, obj) {
    var result = clone(game_state);
    var [x, y] = [obj.position.col, obj.position.row];
    const dir = [[x-1, y], [x+1, y], [x, y-1], [x, y+1]];
    if(result.plague_map[y][x])
        result.plague_map[y][x]++;
    else
        result.plague_map[y][x] = 1;
    for(const [lx, ly] of dir) {
        if(result.plague_map[ly][lx])
            result.plague_map[ly][lx]++;
        else
            result.plague_map[ly][lx] = 1;
    }
    return result;
}

function format_plague(game_state) {
    var result = clone(game_state);
    for(var i = 0; i < result.size.rows; i++) {
        for(var j = 0; j < result.size.cols; j++) {
            if(result.plague_map[i][j] && (result.plague_map[i][j] > mpill)) {
                if(result.map[i][j] != 6)
                    result.map[i][j] = 1000;
            }
        }
    }
    return result;
}

function go_to_safe(game_state, location) {
    const queue = [[location, 0]];
    const visited = new Map();
    visited.set(location.toString(), null);
    
    for (let [curr, distance] of queue) {
        if (game_state.map[curr[1]][curr[0]] == 0 && (distance/mspeed < 2)) {
            let path = [];
            while (curr) {
                var temp = [curr];
                if(visited.get(curr.toString()) == null)
                    break;
                [curr, action] = visited.get(curr.toString());
                temp.push(action);
                path.push(temp);
            }
            return path.reverse().reduce((p, c) => {return p + c[1]}, "");
        }

        var neighbors = get_free_neighbors_2(game_state, curr, false);
        for (let [adj, action] of neighbors) {
            if (visited.has(adj.toString()))
                continue;
            visited.set(adj.toString(), [curr, action]);
            queue.push([adj, distance + 1]);
        }
    }
    
    return null;
}

function astar_all(game_state, start) {
    var dists = Array.from(Array(game_state.size.rows), () => Array.from(Array(game_state.size.cols), () => Infinity));
    dists[start[1]][start[0]] = 0;
    var open_list = [Node(null, start, null, clone(game_state))];
    var closed_list = [];

    while (open_list.length > 0) {
        // Simulate priority queue
        var curr_node = open_list[0];
        var curr_index = 0;
        for (const [index, node] of open_list.entries()) {
            if (node.f < curr_node.f) {
                curr_node = node;
                curr_index = index;
            }
        }

        // Remove current node from active list
        open_list.splice(curr_index, 1);
        closed_list.push(curr_node);

        // get neighbors of current node
        var neighbors = get_free_neighbors(curr_node.map, curr_node.location);
        var neighbor_nodes = [];
        for (const neighbor of neighbors) {
            neighbor_nodes.push(Node(null, neighbor[0], neighbor[1], neighbor[2]));
        }

        for (const neighbor of neighbor_nodes) {
            var in_closed = false;
            var will_add = true;
            
            for (const [index, node] of closed_list.entries()) {
                if (equal_coor(neighbor.location, node.location)) {
                    in_closed = true;
                    break;
                }
            }

            if(in_closed)
                continue;

            // cost = g(current) + movementcost(current, neighbor)
            var cost = curr_node.g + neighbor.action.replaceAll("b", "").length;

            // remove old pending node if current is better
            for (const [index, node] of open_list.entries()) {
                if (equal_coor(neighbor.location, node.location)) {
                    if(cost < node.g) {
                        open_list.splice(index, 1);
                        will_add = true;
                    } else {
                        will_add = false;
                    }
                    break;
                }
            }

            if (will_add) {
                neighbor.g = cost;
                neighbor.h = 0;
                neighbor.f = neighbor.g + neighbor.h;
                neighbor.parent = curr_node;
                open_list.push(neighbor);
                if(dists[neighbor.location[1]][neighbor.location[0]] > neighbor.f)
                    dists[neighbor.location[1]][neighbor.location[0]] = neighbor.f;
            }
        }
    }
    return dists;
}

function spoil_list(game_state) {
    var result = [];
    var game_state_clone = clone(game_state);
    var mdists = astar_all(game_state_clone, mloc);
    var odists = astar_all(game_state_clone, oloc);
    for(const spoil of game_state_clone.spoils) {
        if(spoil.spoil_type == SPOIL.TIME && mdelay == 0)
            continue;
        if(spoil.spoil_type == SPOIL.BOMB_POW && mpower >= 4)
            continue;
        if(mdists[spoil.row][spoil.col] == Infinity)
            continue;
        if(spoil.spoil_type == SPOIL.PILL)
            spoil.value = 2;
        else
            spoil.value = 1;
        spoil.surround_value = game_state_clone.sum_spoil[spoil.row][spoil.col];
        spoil.nvalue = spoil.value + spoil.surround_value*surround_factor;
        spoil.mdist = mdists[spoil.row][spoil.col];
        spoil.mratio = spoil.nvalue/(spoil.mdist + 1);
        spoil.odist = odists[spoil.row][spoil.col];
        spoil.oratio = spoil.nvalue/(spoil.odist + 1);
        spoil.diff = spoil.mratio - spoil.oratio;
        result.push(spoil);
    }

    for(const human of game_state_clone.human) {
        if(mdists[human.position.row][human.position.col] == Infinity)
            continue;
        if(human.infected && (mpill - 1) == 0)
            continue;
        if(human.curedRemainTime > human_cure)
            continue;
        human.value = 2;
        human.surround_value = game_state_clone.sum_spoil[human.position.row][human.position.col];
        human.nvalue = human.value + human.surround_value*surround_factor;
        human.mdist = mdists[human.position.row][human.position.col];
        human.mratio = human.nvalue/(human.mdist + 1);
        human.odist = odists[human.position.row][human.position.col];
        human.oratio = human.nvalue/(human.odist + 1);
        human.diff = human.mratio - human.oratio;
        human.row = human.position.row;
        human.col = human.position.col;
        result.push(human);
    }

    if((mpill - 1) != 0) {
        for(const virus of game_state_clone.viruses) {
            if(mdists[virus.position.row][virus.position.col] == Infinity)
                continue;
            virus.value = 1;
            virus.surround_value = game_state_clone.sum_spoil[virus.position.row][virus.position.col];
            virus.nvalue = virus.value + virus.surround_value*surround_factor;
            virus.mdist = mdists[virus.position.row][virus.position.col];
            virus.mratio = virus.nvalue/(virus.mdist + 1);
            virus.odist = odists[virus.position.row][virus.position.col];
            virus.oratio = virus.nvalue/(virus.odist + 1);
            virus.diff = virus.mratio - virus.oratio;
            virus.row = virus.position.row;
            virus.col = virus.position.col;
            result.push(virus);
        }
    }

    return result.sort((a, b) => b.diff - a.diff);
}

function box_list(game_state) {
    var result = [];
    var game_state_clone = clone(game_state);
    var dists = astar_all(game_state_clone, mloc);
    for(var i = 0; i < game_state_clone.size.rows; i++) {
        for(var j = 0; j < game_state_clone.size.cols; j++) {
            if(dists[i][j] == Infinity)
                continue;
            if(game_state_clone.map[i][j] != 0)
                continue;
            if(find_safe_square(game_state_clone, [j, i], mpower) == null)
                continue;
            var temp = {};
            temp.value = count_surrounding(game_state_clone, [j, i])*box_factor;
            if(temp.value == 0)
                continue;
            temp.dist = dists[i][j];
            temp.ratio = temp.value/(temp.dist + 1);
            temp.col = j;
            temp.row = i;
            result.push(temp);
        }
    }

    return result.sort((a, b) => b.ratio - a.ratio);
}

function count_surrounding(game_state, location) {
    var res = 0;
    var [x, y] = location;
    if(is_in_bounds(game_state, [x-1, y]) && game_state.map[y][x-1] == 2)
        res++;
    if(is_in_bounds(game_state, [x+1, y]) && game_state.map[y][x+1] == 2)
        res++;
    if(is_in_bounds(game_state, [x, y-1]) && game_state.map[y-1][x] == 2)
        res++;
    if(is_in_bounds(game_state, [x, y+1]) && game_state.map[y+1][x] == 2)
        res++;
    return res;
}

function spoil_list_to_2d(game_state, list) {
    var result = clone(game_state);
    if(!result.val_map)
        result.val_map = Array.from(Array(result.size.rows), () => Array.from(Array(result.size.cols), () => 0));
    for(const obj of list) {
        if(obj.spoil_type == SPOIL.PILL)
            result.val_map[obj.row][obj.col] += 2;
        else if(obj.spoil_type == SPOIL.BOMB_POW && mpower < 4)
            result.val_map[obj.row][obj.col] += 1;
        else if(obj.spoil_type == SPOIL.TIME && mdelay != 0)
            result.val_map[obj.row][obj.col] += 1;
    }

    return result;
}

function human_list_to_2d(game_state, list) {
    var result = clone(game_state);
    if(!result.val_map)
        result.val_map = Array.from(Array(result.size.rows), () => Array.from(Array(result.size.cols), () => 0));
    for(const human of list) {
        if(human.infected && (mpill - 1) == 0)
            continue;
        if(human.curedRemainTime > human_cure)
            continue;
        result.val_map[human.position.row][human.position.col] += 2;
    }

    return result;
}

function virus_list_to_2d(game_state, list) {
    var result = clone(game_state);
    if(mpill - 1 == 0)
        return result;
    if(!result.val_map)
        result.val_map = Array.from(Array(result.size.rows), () => Array.from(Array(result.size.cols), () => 0));
    for(const virus of list) {
        result.val_map[virus.position.row][virus.position.col] += 1;
    }

    return result;
}

function plague_list_to_2d_virus(game_state, list) {
    var result = clone(game_state);
    if(!result.plague_count_map)
        result.plague_count_map = Array.from(Array(result.size.rows), () => Array.from(Array(result.size.cols), () => 0));
    for(const virus of list) {
        result.plague_count_map[virus.position.row][virus.position.col] += 1;
    }

    return result;
}

function plague_list_to_2d_human(game_state, list) {
    var result = clone(game_state);
    if(!result.plague_count_map)
        result.plague_count_map = Array.from(Array(result.size.rows), () => Array.from(Array(result.size.cols), () => 0));
    for(const human of list.filter(h => h.infected)) {
        result.plague_count_map[human.position.row][human.position.col] += 1;
    }

    return result;
}

function gen_sum_of_spoil(game_state) {
    var result = clone(game_state);
    if(!result.sum_spoil)
        result.sum_spoil = Array.from(Array(result.size.rows), () => Array.from(Array(result.size.cols), () => 0));
    if(!enable_v2)
        return result;
    var max_row = result.size.rows;
    var max_col = result.size.cols;
    for(var i = 0; i < max_row; i++) {
        for(var j = 0; j < max_col; j++) {
            result.sum_spoil[i][j] = sum_of_spoil(game_state, [j, i]);
        }
    }
    return result;
}

function sum_of_spoil(game_state, location) {
    var [x, y] = location;
    var dists = Array.from(Array(game_state.size.rows), () => Array.from(Array(game_state.size.cols), () => Infinity));
    dists[y][x] = 0;
    var result = game_state.val_map[y][x];
    var open_list = [Node(null, location, null, clone(game_state))];
    var closed_list = [];

    while (open_list.length > 0) {
        // Simulate priority queue
        var curr_node = open_list[0];
        var curr_index = 0;
        for (const [index, node] of open_list.entries()) {
            if (node.f < curr_node.f) {
                curr_node = node;
                curr_index = index;
            }
        }

        // Remove current node from active list
        open_list.splice(curr_index, 1);
        closed_list.push(curr_node);

        if(dists[curr_node.location[1]][curr_node.location[0]] != Infinity)
            result += game_state.val_map[curr_node.location[1]][curr_node.location[0]];

        // get neighbors of current node
        var neighbors = get_free_neighbors(curr_node.map, curr_node.location);
        var neighbor_nodes = [];
        for (const neighbor of neighbors) {
            neighbor_nodes.push(Node(null, neighbor[0], neighbor[1], neighbor[2]));
        }

        for (const neighbor of neighbor_nodes) {
            var in_closed = false;
            var will_add = true;
            
            for (const [index, node] of closed_list.entries()) {
                if (equal_coor(neighbor.location, node.location)) {
                    in_closed = true;
                    break;
                }
            }

            if(in_closed)
                continue;

            // cost = g(current) + movementcost(current, neighbor)
            var cost = curr_node.g + neighbor.action.replaceAll("b", "").length;
            if(cost > radius)
                continue;

            // remove old pending node if current is better
            for (const [index, node] of open_list.entries()) {
                if (equal_coor(neighbor.location, node.location)) {
                    if(cost < node.g) {
                        open_list.splice(index, 1);
                        will_add = true;
                    } else {
                        will_add = false;
                    }
                    break;
                }
            }

            if (will_add) {
                neighbor.g = cost;
                neighbor.h = 0;
                neighbor.f = neighbor.g + neighbor.h;
                neighbor.parent = curr_node;
                open_list.push(neighbor);
                if(dists[neighbor.location[1]][neighbor.location[0]] > neighbor.f)
                    dists[neighbor.location[1]][neighbor.location[0]] = neighbor.f;
            }
        }
    }

    return result;
}

function pause_bot() {
    pause = true;
}

function resume_bot() {
    pause = false;
    is_moving = false;
}

function setBox() {
    var new_val = Number(document.getElementById("box-factor").value);
    if(!Number.isNaN(new_val))
        box_factor = new_val;
}

function setSpeed() {
    var new_val = Number(document.getElementById("speed").value);
    if(!Number.isNaN(new_val))
        slice_factor = new_val;
}

function stageOne() {
    box_factor = high_box_factor;
    document.getElementById("stage-status").innerHTML = "1";
}

function stageTwo() {
    box_factor = low_box_factor;
    document.getElementById("stage-status").innerHTML = "2";
}