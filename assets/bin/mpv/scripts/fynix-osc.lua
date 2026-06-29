local mp = require 'mp'
local assdraw = require 'mp.assdraw'
local options = require 'mp.options'
local msg = require 'mp.msg'

msg.info('fynix-osc.lua script starting...')

local config = {
    accent = 'FF6B00',
    hide_timeout = 3,
}
options.read_options(config, 'fynix')
msg.info('fynix-osc config: accent=' .. tostring(config.accent))

local function hex_to_ass(hex)
    hex = hex:gsub('^#', '')
    if #hex < 6 then hex = 'FF6B00' end
    local r = hex:sub(1, 2)
    local g = hex:sub(3, 4)
    local b = hex:sub(5, 6)
    return string.format('&H%s%s%s', b:upper(), g:upper(), r:upper())
end

local accent = hex_to_ass(config.accent)
local white = '&HFFFFFF&'
local gray = '&H888888&'

local state = {
    visible = false,
    row = 2,        -- 1 = seek bar, 2 = buttons
    focus = 3,      -- index in current row (1-based)
    paused = false,
    time_pos = 0,
    duration = 0,
    speed = 1,
    skip_intro_end = nil,
    has_next = false,
    osd_w = 1920,
    osd_h = 1080,
    menu_open = false,
}

local hide_timer = nil
local render

local function format_time(t)
    if t < 0 then t = 0 end
    local h = math.floor(t / 3600)
    local m = math.floor((t % 3600) / 60)
    local s = math.floor(t % 60)
    if h > 0 then
        return string.format('%d:%02d:%02d', h, m, s)
    end
    return string.format('%d:%02d', m, s)
end

local function show_osd()
    state.visible = true
    if hide_timer then hide_timer:kill() end
    hide_timer = mp.add_timeout(config.hide_timeout, function()
        state.visible = false
        hide_timer = nil
        render()
    end)
    render()
end

local function hide_osd()
    state.visible = false
    if hide_timer then hide_timer:kill() end
    render()
end

-- Row 2 buttons: audio, rewind, play, stop, ff, next, subs
local function get_buttons()
    local btns = {
        {id = 'audio', icon = '\u{266A}', width = 60},       -- music note
        {id = 'rewind', icon = '\u{25C0}\u{25C0}', width = 60}, -- left triangles
        {id = 'play', icon = '\u{25B6}', width = 60},        -- play
        {id = 'stop', icon = '\u{25A0}', width = 60},        -- stop
        {id = 'ff', icon = '\u{25B6}\u{25B6}', width = 60},  -- right triangles
    }
    if state.has_next then
        btns[#btns + 1] = {id = 'next', icon = '\u{25B6}\u{25B6}\u{007C}', width = 60} -- next track
    end
    if state.skip_intro_end then
        btns[#btns + 1] = {id = 'skip', label = 'Skip Intro', width = 120}
    end
    btns[#btns + 1] = {id = 'subs', icon = 'CC', width = 60}
    return btns
end

local function get_row_count()
    return 2
end

local function get_row_items(row)
    if row == 1 then
        return {{id = 'seek', type = 'seekbar'}}
    else
        return get_buttons()
    end
end

local function move_focus(dir)
    local items = get_row_items(state.row)
    local n = #items
    state.focus = state.focus + dir
    if state.focus < 1 then state.focus = n end
    if state.focus > n then state.focus = 1 end
    show_osd()
end

local function switch_row(dir)
    if dir > 0 then
        if state.row < get_row_count() then
            state.row = state.row + 1
            state.focus = 1
        end
    else
        if state.row > 1 then
            state.row = state.row - 1
            state.focus = 1
        end
    end
    show_osd()
end

-- Speed control
local fwd_speeds = {2, 4, 8}
local rev_speeds = {-2, -4, -8}

local function reset_speed()
    state.speed = 1
    mp.set_property_number('speed', 1)
end

local function fast_forward()
    if state.speed >= 1 then
        local idx = 0
        for i, s in ipairs(fwd_speeds) do
            if s == state.speed then idx = i break end
        end
        idx = idx + 1
        if idx > #fwd_speeds then
            state.speed = 1
        else
            state.speed = fwd_speeds[idx]
        end
    else
        state.speed = fwd_speeds[1]
    end
    mp.set_property_number('speed', state.speed)
    mp.commandv('set', 'pause', 'no')
    show_osd()
end

local function rewind()
    if state.speed <= 1 then
        local idx = 0
        for i, s in ipairs(rev_speeds) do
            if s == state.speed then idx = i break end
        end
        idx = idx + 1
        if idx > #rev_speeds then
            state.speed = 1
        else
            state.speed = rev_speeds[idx]
        end
    else
        state.speed = rev_speeds[1]
    end
    mp.set_property_number('speed', state.speed)
    mp.commandv('set', 'pause', 'no')
    show_osd()
end

-- Subtitle cycling (includes Off)
local function cycle_subs()
    local tracks = mp.get_property_native('track-list')
    local sub_ids = {}
    for _, track in ipairs(tracks) do
        if track.type == 'sub' then
            sub_ids[#sub_ids + 1] = track.id
        end
    end
    if #sub_ids == 0 then
        mp.commandv('show-text', 'No subtitles available', 2000)
        return
    end

    local current_sid = mp.get_property_number('sid', 0)
    local idx = 0
    if current_sid and current_sid > 0 then
        for i, id in ipairs(sub_ids) do
            if id == current_sid then idx = i break end
        end
    end

    -- Cycle: 0 (off) -> 1 -> 2 -> ... -> 0 (off)
    idx = idx + 1
    if idx > #sub_ids then idx = 0 end

    if idx == 0 then
        mp.commandv('set', 'sid', 'no')
        mp.commandv('show-text', 'Subtitles: Off', 2000)
    else
        mp.commandv('set', 'sid', tostring(sub_ids[idx]))
        local label = ''
        for _, track in ipairs(tracks) do
            if track.id == sub_ids[idx] and track.type == 'sub' then
                label = (track.lang or track.title or 'Track ' .. track.id)
                break
            end
        end
        mp.commandv('show-text', 'Subtitles: ' .. label, 2000)
    end
end

-- Audio cycling
local function cycle_audio()
    local tracks = mp.get_property_native('track-list')
    local audio_ids = {}
    for _, track in ipairs(tracks) do
        if track.type == 'audio' then
            audio_ids[#audio_ids + 1] = track.id
        end
    end
    if #audio_ids == 0 then return end

    local current_aid = mp.get_property_number('aid', 0)
    local idx = 0
    for i, id in ipairs(audio_ids) do
        if id == current_aid then idx = i break end
    end

    idx = idx + 1
    if idx > #audio_ids then idx = 1 end

    mp.commandv('set', 'aid', tostring(audio_ids[idx]))
    local label = ''
    for _, track in ipairs(tracks) do
        if track.id == audio_ids[idx] and track.type == 'audio' then
            label = (track.lang or track.title or 'Track ' .. track.id)
            break
        end
    end
    mp.commandv('show-text', 'Audio: ' .. label, 2000)
end

local function activate()
    if state.row == 1 then
        -- Seek bar - Enter does nothing special
        return
    end

    local btns = get_buttons()
    local btn = btns[state.focus]
    if not btn then return end

    if btn.id == 'play' then
        reset_speed()
        mp.commandv('cycle', 'pause')
    elseif btn.id == 'stop' then
        mp.command('quit')
    elseif btn.id == 'rewind' then
        rewind()
    elseif btn.id == 'ff' then
        fast_forward()
    elseif btn.id == 'audio' then
        cycle_audio()
    elseif btn.id == 'subs' then
        cycle_subs()
    elseif btn.id == 'next' then
        mp.command('quit 42')
    elseif btn.id == 'skip' then
        if state.skip_intro_end then
            mp.commandv('seek', state.skip_intro_end / 1000, 'absolute')
            state.skip_intro_end = nil
        end
    end
    show_osd()
end

local function on_key(key)
    if state.menu_open then return end

    if not state.visible then
        if key == 'enter' then
            show_osd()
        elseif key == 'space' then
            reset_speed()
            mp.commandv('cycle', 'pause')
            show_osd()
        elseif key == 'left' then
            mp.commandv('seek', -10)
        elseif key == 'right' then
            mp.commandv('seek', 10)
        elseif key == 'up' then
            mp.commandv('add', 'volume', 5)
        elseif key == 'down' then
            mp.commandv('add', 'volume', -5)
        elseif key == 'esc' or key == 'back' then
            mp.command('quit')
        end
    else
        if key == 'enter' then
            activate()
        elseif key == 'space' then
            reset_speed()
            mp.commandv('cycle', 'pause')
            show_osd()
        elseif key == 'left' then
            if state.row == 1 then
                mp.commandv('seek', -10)
                show_osd()
            else
                move_focus(-1)
            end
        elseif key == 'right' then
            if state.row == 1 then
                mp.commandv('seek', 10)
                show_osd()
            else
                move_focus(1)
            end
        elseif key == 'up' then
            switch_row(-1)
        elseif key == 'down' then
            switch_row(1)
        elseif key == 'esc' or key == 'back' then
            hide_osd()
        elseif key == 'q' then
            mp.command('quit')
        end
    end
end

function render()
    local ass = assdraw.ass_new()

    if not state.visible then
        mp.set_osd_ass(state.osd_w, state.osd_h, '')
        return
    end

    local w = state.osd_w
    local h = state.osd_h
    local bar_h = 120
    local bar_y = h - bar_h

    -- Background bar
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\1c&H0A0A0A&\\1a&HCC&}')
    ass:draw_start()
    ass:rect_cw(0, bar_y, w, h)
    ass:draw_stop()

    -- Row 1: Seek bar + time (top portion of bar)
    local seek_y = bar_y + 20
    local seek_h = 30
    local seek_x = 40
    local time_width = 180
    local seek_width = w - seek_x - time_width - 80

    -- Seek bar background
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\1c&H333333&\\1a&H00&}')
    ass:draw_start()
    ass:rect_cw(seek_x, seek_y, seek_x + seek_width, seek_y + 4)
    ass:draw_stop()

    -- Seek bar fill
    local progress = state.duration > 0 and state.time_pos / state.duration or 0
    local fg_w = seek_width * progress
    local seek_focused = (state.row == 1 and state.focus == 1)
    local fg_h = seek_focused and 6 or 4

    if fg_w > 0 then
        ass:new_event()
        ass:append('{\\an7}{\\pos(0,0)}')
        ass:append('{\\1c' .. accent .. '\\1a&H00&}')
        ass:draw_start()
        ass:rect_cw(seek_x, seek_y + (4 - fg_h) / 2, seek_x + fg_w, seek_y + (4 - fg_h) / 2 + fg_h)
        ass:draw_stop()

        -- Position dot
        local dot_x = seek_x + fg_w
        local dot_r = seek_focused and 8 or 5
        ass:new_event()
        ass:append('{\\an7}{\\pos(0,0)}')
        ass:append('{\\1c' .. accent .. '\\1a&H00&}')
        ass:draw_start()
        ass:round_rect_cw(dot_x - dot_r, seek_y + 2 - dot_r, dot_x + dot_r, seek_y + 2 + dot_r, dot_r)
        ass:draw_stop()
    end

    -- Seek bar focus highlight
    if seek_focused then
        ass:new_event()
        ass:append('{\\an7}{\\pos(0,0)}')
        ass:append('{\\3c' .. accent .. '\\3a&H00&\\1a&HFF&\\bord2}')
        ass:draw_start()
        ass:round_rect_cw(seek_x - 10, seek_y - 10, seek_x + seek_width + 10, seek_y + 14, 4)
        ass:draw_stop()
    end

    -- Time display
    local time_str = format_time(state.time_pos) .. ' / ' .. format_time(state.duration)
    ass:new_event()
    ass:append('{\\an5}')
    ass:pos(seek_x + seek_width + time_width / 2 + 20, seek_y + 2)
    ass:append('{\\fs18\\1c' .. white .. '}')
    ass:append(time_str)

    -- Speed indicator (if not 1x)
    if state.speed ~= 1 then
        local speed_str = string.format('%.0fx', state.speed)
        ass:new_event()
        ass:append('{\\an5}')
        ass:pos(seek_x + 60, seek_y + 2)
        ass:append('{\\fs18\\1c' .. accent .. '\\b1}')
        ass:append(speed_str)
    end

    -- Row 2: Buttons
    local btn_y = bar_y + 65
    local btn_cy = btn_y + 20
    local btns = get_buttons()
    local n = #btns

    -- Calculate positions: audio left, subs right, center group centered
    local center_count = 0
    for i, btn in ipairs(btns) do
        if btn.id ~= 'audio' and btn.id ~= 'subs' then
            center_count = center_count + 1
        end
    end

    local btn_w = 60
    local btn_gap = 20
    local center_total = center_count * btn_w + (center_count - 1) * btn_gap
    local center_start = (w - center_total) / 2

    -- Assign x positions
    local center_idx = 0
    for i, btn in ipairs(btns) do
        if btn.id == 'audio' then
            btn.x = 40
        elseif btn.id == 'subs' then
            btn.x = w - 40 - btn_w
        else
            center_idx = center_idx + 1
            btn.x = center_start + (center_idx - 1) * (btn_w + btn_gap)
        end
        btn.cx = btn.x + btn_w / 2
    end

    -- Draw buttons
    for i, btn in ipairs(btns) do
        local is_focused = (state.row == 2 and state.focus == i)
        local color = is_focused and accent or white

        if btn.icon then
            ass:new_event()
            ass:append('{\\an5}')
            ass:pos(btn.cx, btn_cy)
            ass:append('{\\fs28\\1c' .. color .. '}')
            ass:append(btn.icon)
        elseif btn.label then
            ass:new_event()
            ass:append('{\\an5}')
            ass:pos(btn.cx, btn_cy)
            ass:append('{\\fs18\\1c' .. color .. '}')
            ass:append(btn.label)
        end

        -- Play/pause icon override
        if btn.id == 'play' then
            local icon = state.paused and '\u{25B6}' or '\u{25AE}\u{25AE}'
            ass:new_event()
            ass:append('{\\an5}')
            ass:pos(btn.cx, btn_cy)
            ass:append('{\\fs28\\1c' .. color .. '}')
            ass:append(icon)
        end

        -- Focus highlight
        if is_focused then
            local pad = 8
            local fw = btn.label and 120 or btn_w
            local fx = btn.label and (btn.cx - fw / 2) or btn.x
            ass:new_event()
            ass:append('{\\an7}{\\pos(0,0)}')
            ass:append('{\\3c' .. accent .. '\\3a&H00&\\1a&HFF&\\bord2}')
            ass:draw_start()
            ass:round_rect_cw(fx - pad, btn_y - 5, fx + fw + pad, btn_y + 45, 6)
            ass:draw_stop()
        end
    end

    mp.set_osd_ass(w, h, ass.text)
end

mp.observe_property('pause', 'bool', function(_, value)
    state.paused = value
    render()
end)

mp.observe_property('time-pos', 'number', function(_, value)
    state.time_pos = value or 0
    render()
end)

mp.observe_property('duration', 'number', function(_, value)
    state.duration = value or 0
    render()
end)

mp.observe_property('osd-width', 'number', function(_, value)
    state.osd_w = value or 1920
    render()
end)

mp.observe_property('osd-height', 'number', function(_, value)
    state.osd_h = value or 1080
    render()
end)

mp.register_script_message('show-skip-intro', function(endMs)
    state.skip_intro_end = tonumber(endMs)
    show_osd()
end)

mp.register_script_message('set-has-next', function(hasNext)
    state.has_next = hasNext == 'true'
    render()
end)

mp.register_script_message('hide-skip-intro', function()
    state.skip_intro_end = nil
    render()
end)

mp.register_script_message('fynix-osc-key', function(key)
    if key == 'click' then
        show_osd()
    else
        on_key(key)
    end
end)

msg.info('fynix-osc.lua script loaded successfully')
render()
