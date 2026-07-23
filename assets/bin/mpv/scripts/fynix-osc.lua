local mp = require 'mp'
local assdraw = require 'mp.assdraw'
local options = require 'mp.options'
local msg = require 'mp.msg'
local utils = require 'mp.utils'

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
local dim = '&H555555&'

local state = {
    visible = false,
    row = 1,
    focus = 3,
    paused = false,
    time_pos = 0,
    duration = 0,
    speed = 1,
    skip_intro_end = nil,
    has_next = false,
    autoplay = false,
    osd_w = 1920,
    osd_h = 1080,

    splash = false,
    splash_dots = '',
    splash_timer = nil,

    clearlogo = nil,

    up_next = nil,
    up_next_countdown = 10,
    up_next_timer = nil,

    key_repeat = 0,
    key_repeat_time = 0,
    last_key = '',

    thumbfast = nil,
}

local popup = {
    active = nil,
    items = {},
    focus = 1,
    scroll = 0,
}

local hide_timer = nil
local render

local MAX_POPUP_ITEMS = 8
local POPUP_ITEM_H = 36
local POPUP_HEADER_H = 38
local POPUP_W = 220

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
    if not popup.active then
        hide_timer = mp.add_timeout(config.hide_timeout, function()
            state.visible = false
            hide_timer = nil
            render()
        end)
    end
    render()
end

local function hide_osd()
    state.visible = false
    if hide_timer then hide_timer:kill() end
    if state.thumbfast then
        mp.commandv('script-message', 'thumbfast:clear')
    end
    render()
end

local function close_popup()
    popup.active = nil
    popup.items = {}
    popup.focus = 1
    popup.scroll = 0
    show_osd()
end

-- Splash spinner animation
local function update_splash_spinner()
    if not state.splash then return end
    local dots = state.splash_dots
    if #dots >= 3 then
        state.splash_dots = ''
    else
        state.splash_dots = dots .. '.'
    end
    render()
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

-- Aspect ratio
local aspect_ratios = {'-1', '4/3', '16/9', '16/10', '21/9', '2.35/1'}
local aspect_labels = {'Auto', '4:3', '16:9', '16:10', '21:9', '2.35:1'}

-- Popup management
local function get_audio_items()
    local tracks = mp.get_property_native('track-list')
    local items = {}
    local current_aid = mp.get_property_number('aid', 0)
    for _, track in ipairs(tracks) do
        if track.type == 'audio' then
            local label = track.lang or track.title or ('Track ' .. track.id)
            if track.title and track.lang then
                label = track.lang .. ' - ' .. track.title
            end
            items[#items + 1] = {
                label = label,
                value = track.id,
                selected = (track.id == current_aid),
            }
        end
    end
    return items
end

local function get_sub_items()
    local tracks = mp.get_property_native('track-list')
    local items = {
        {label = 'Off', value = 0, selected = (mp.get_property_number('sid', 0) == 0)},
    }
    for _, track in ipairs(tracks) do
        if track.type == 'sub' then
            local label = track.lang or track.title or ('Track ' .. track.id)
            if track.title and track.lang then
                label = track.lang .. ' - ' .. track.title
            end
            items[#items + 1] = {
                label = label,
                value = track.id,
                selected = (track.id == mp.get_property_number('sid', 0)),
            }
        end
    end
    return items
end

local function get_aspect_items()
    local items = {}
    for i, label in ipairs(aspect_labels) do
        items[#items + 1] = {
            label = label,
            value = aspect_ratios[i],
            idx = i,
            selected = (i == state.aspect_idx),
        }
    end
    return items
end

local function open_popup(type)
    popup.active = type
    popup.focus = 1
    popup.scroll = 0

    if type == 'audio' then
        popup.items = get_audio_items()
    elseif type == 'subs' then
        popup.items = get_sub_items()
    elseif type == 'aspect' then
        popup.items = get_aspect_items()
    end

    -- Find currently selected item
    for i, item in ipairs(popup.items) do
        if item.selected then
            popup.focus = i
            if i > MAX_POPUP_ITEMS then
                popup.scroll = i - MAX_POPUP_ITEMS
            end
            break
        end
    end

    if hide_timer then hide_timer:kill() end
    render()
end

local function select_popup_item()
    local item = popup.items[popup.focus]
    if not item then close_popup() return end

    if popup.active == 'audio' then
        mp.commandv('set', 'aid', tostring(item.value))
        mp.commandv('show-text', 'Audio: ' .. item.label, 2000)
    elseif popup.active == 'subs' then
        mp.set_property('user-data/fynix/sub-action', '')
        if item.value == 0 then
            mp.commandv('set', 'sid', 'no')
            mp.commandv('show-text', 'Subtitles: Off', 2000)
        else
            mp.commandv('set', 'sid', tostring(item.value))
            mp.commandv('show-text', 'Subtitles: ' .. item.label, 2000)
        end
    elseif popup.active == 'aspect' then
        mp.set_property('video-aspect-override', item.value)
        state.aspect_idx = item.idx
        mp.commandv('show-text', 'Aspect: ' .. item.label, 2000)
    end

    close_popup()
end

-- Button definitions
local function get_buttons()
    local btns = {}
    if state.skip_intro_end then
        btns[#btns + 1] = {id = 'skip', label = 'Skip Intro', w = 140}
    end
    btns[#btns + 1] = {id = 'rewind', icon = '\u{25C0}\u{25C0}', w = 48}
    btns[#btns + 1] = {id = 'play', icon = '\u{25B6}', w = 56}
    btns[#btns + 1] = {id = 'ff', icon = '\u{25B6}\u{25B6}', w = 48}
    if state.has_next then
        btns[#btns + 1] = {id = 'next', icon = '\u{25B6}\u{25B6}\u{007C}', w = 48}
    end
    btns[#btns + 1] = {id = 'audio', icon = '\u{266A}', w = 48}
    btns[#btns + 1] = {id = 'subs', icon = 'CC', w = 48}
    btns[#btns + 1] = {id = 'aspect', label = 'AR', w = 48}
    return btns
end

local function get_row_items(row)
    if row == 2 then
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
        if state.row < 2 then
            state.row = state.row + 1
            state.focus = 1
        end
    else
        if state.row > 1 then
            state.row = state.row - 1
            state.focus = 1
        end
    end
    if state.row ~= 2 and state.thumbfast then
        mp.commandv('script-message', 'thumbfast:clear')
    end
    show_osd()
end

local function activate()
    if state.row == 2 then return end
    local btns = get_buttons()
    local btn = btns[state.focus]
    if not btn then return end

    if btn.id == 'play' then
        reset_speed()
        mp.commandv('cycle', 'pause')
    elseif btn.id == 'rewind' then
        rewind()
    elseif btn.id == 'ff' then
        fast_forward()
    elseif btn.id == 'audio' then
        open_popup('audio')
        return
    elseif btn.id == 'subs' then
        open_popup('subs')
        return
    elseif btn.id == 'aspect' then
        open_popup('aspect')
        return
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

-- Seek stepping
local seek_steps = {5, 10, 20, 30, 60, 300, 600, 1200, 1800, 3600}

local function do_seek(key)
    if key == state.last_key and mp.get_time() - state.key_repeat_time < 0.8 then
        state.key_repeat = state.key_repeat + 1
    else
        state.key_repeat = 1
    end
    state.key_repeat_time = mp.get_time()
    state.last_key = key
    local amount = seek_steps[math.min(state.key_repeat, #seek_steps)]
    if key == 'left' then
        mp.commandv('seek', -amount)
    else
        mp.commandv('seek', amount)
    end
end

-- Drawing functions
local function draw_gradient(ass, w, h)
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\blur120\\bord120\\1c&H0A0A0A&\\3c&H0A0A0A&}')
    ass:draw_start()
    ass:rect_cw(0, h - 80, w, h)
    ass:draw_stop()
end

local function draw_splash(ass, w, h)
    local cx = w / 2
    local cy = h / 2
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\1c&H000000&\\1a&H88&}')
    ass:draw_start()
    ass:rect_cw(0, 0, w, h)
    ass:draw_stop()
    ass:new_event()
    ass:append('{\\an5}')
    ass:pos(cx, cy - 40)
    ass:append('{\\fs64\\1c' .. accent .. '\\b1}')
    ass:append('Fynix Media Hub')
    ass:new_event()
    ass:append('{\\an5}')
    ass:pos(cx, cy + 20)
    ass:append('{\\fs20\\1c' .. gray .. '}')
    ass:append('Preparing stream' .. state.splash_dots)
    ass:new_event()
    ass:append('{\\an5}')
    ass:pos(cx, cy + 60)
    ass:append('{\\fs14\\1c' .. gray .. '}')
    ass:append('\u{25EF}')
end

local function draw_clearlogo(ass, w, h)
    if not state.clearlogo then return end
    local logo_x = w - 60
    local logo_y = h - 320
    -- Shadow
    ass:new_event()
    ass:append('{\\an9}')
    ass:pos(logo_x + 2, logo_y + 2)
    ass:append('{\\fs42\\1c&H000000&\\alpha&H80&\\b1}')
    ass:append(state.clearlogo)
    -- Main text
    ass:new_event()
    ass:append('{\\an9}')
    ass:pos(logo_x, logo_y)
    ass:append('{\\fs42\\1c' .. accent .. '\\b1}')
    ass:append(state.clearlogo)
end

local function draw_up_next(ass, w, h)
    if not state.up_next then return end
    local box_w = 360
    local box_h = 200
    local box_x = w - box_w - 60
    local box_y = h - box_h - 320
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\1c&H0A0A0A&\\1a&H00&}')
    ass:draw_start()
    ass:round_rect_cw(box_x, box_y, box_x + box_w, box_y + box_h, 8)
    ass:draw_stop()
    ass:new_event()
    ass:append('{\\an7}')
    ass:pos(box_x + 20, box_y + 15)
    ass:append('{\\fs16\\1c' .. accent .. '\\b1}')
    ass:append('Up Next')
    local title = state.up_next.title or ''
    ass:new_event()
    ass:append('{\\an7}')
    ass:pos(box_x + 20, box_y + 45)
    ass:append('{\\fs18\\1c' .. white .. '}')
    if #title > 30 then title = title:sub(1, 30) .. '...' end
    ass:append(title)
    if state.up_next.subtitle then
        ass:new_event()
        ass:append('{\\an7}')
        ass:pos(box_x + 20, box_y + 72)
        ass:append('{\\fs14\\1c' .. gray .. '}')
        ass:append(state.up_next.subtitle)
    end
    local cd_cx = box_x + box_w - 55
    local cd_cy = box_y + box_h - 55
    local cd_r = 25
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\3c' .. white .. '\\3a&H00&\\1a&HFF&\\bord3}')
    ass:draw_start()
    ass:round_rect_cw(cd_cx - cd_r, cd_cy - cd_r, cd_cx + cd_r, cd_cy + cd_r, 4)
    ass:draw_stop()
    ass:new_event()
    ass:append('{\\an5}')
    ass:pos(cd_cx, cd_cy + 2)
    ass:append('{\\fs20\\1c' .. white .. '\\b1}')
    ass:append(tostring(state.up_next_countdown))
end

local function draw_popup(ass, w, h)
    if not popup.active then return end
    local visible_count = math.min(#popup.items, MAX_POPUP_ITEMS)
    if visible_count == 0 then return end
    local popup_h = POPUP_HEADER_H + visible_count * POPUP_ITEM_H + 12
    local popup_x = w - POPUP_W - 50
    local popup_y = h - 280 - popup_h

    -- Shadow
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\1c&H000000&\\1a&H80&}')
    ass:draw_start()
    ass:round_rect_cw(popup_x + 4, popup_y + 4, popup_x + POPUP_W + 4, popup_y + popup_h + 4, 8)
    ass:draw_stop()

    -- Background
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\1c&H141414&\\1a&H05&}')
    ass:draw_start()
    ass:round_rect_cw(popup_x, popup_y, popup_x + POPUP_W, popup_y + popup_h, 8)
    ass:draw_stop()

    -- Border
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\3c&H333333&\\3a&H00&\\1a&HFF&\\bord1}')
    ass:draw_start()
    ass:round_rect_cw(popup_x, popup_y, popup_x + POPUP_W, popup_y + popup_h, 8)
    ass:draw_stop()

    -- Header
    local headers = {audio = 'Audio', subs = 'Subtitles', aspect = 'Aspect Ratio'}
    local header = headers[popup.active] or ''
    ass:new_event()
    ass:append('{\\an7}')
    ass:pos(popup_x + 16, popup_y + 10)
    ass:append('{\\fs18\\1c' .. white .. '\\b1}')
    ass:append(header)

    -- Separator
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\1c&H333333&\\1a&H00&}')
    ass:draw_start()
    ass:rect_cw(popup_x + 12, popup_y + POPUP_HEADER_H - 4, popup_x + POPUP_W - 12, popup_y + POPUP_HEADER_H - 3)
    ass:draw_stop()

    -- Items
    for i = 1, visible_count do
        local item = popup.items[popup.scroll + i]
        if item then
            local item_y = popup_y + POPUP_HEADER_H + (i - 1) * POPUP_ITEM_H
            local is_focused = (popup.focus == popup.scroll + i)

            if is_focused then
                ass:new_event()
                ass:append('{\\an7}{\\pos(0,0)}')
                ass:append('{\\1c' .. accent .. '\\1a&HCC&}')
                ass:draw_start()
                ass:round_rect_cw(popup_x + 4, item_y + 2, popup_x + POPUP_W - 4, item_y + POPUP_ITEM_H - 2, 4)
                ass:draw_stop()
            end

            local text_color = is_focused and white or (item.selected and accent or gray)
            ass:new_event()
            ass:append('{\\an7}')
            ass:pos(popup_x + 16, item_y + 8)
            ass:append('{\\fs16\\1c' .. text_color .. (item.selected and '\\b1' or '') .. '}')
            if item.selected then
                ass:append('\u{2713} ')
            end
            ass:append(item.label)
        end
    end

    -- Scroll indicators
    if popup.scroll > 0 then
        ass:new_event()
        ass:append('{\\an5}')
        ass:pos(popup_x + POPUP_W / 2, popup_y + POPUP_HEADER_H - 2)
        ass:append('{\\fs10\\1c' .. gray .. '}')
        ass:append('\u{25B2}')
    end
    if popup.scroll + MAX_POPUP_ITEMS < #popup.items then
        ass:new_event()
        ass:append('{\\an5}')
        ass:pos(popup_x + POPUP_W / 2, popup_y + popup_h - 4)
        ass:append('{\\fs10\\1c' .. gray .. '}')
        ass:append('\u{25BC}')
    end
end

-- thumbfast manages its own overlay; we just send script messages to it

local function render_osd(ass, w, h)
    if state.osd_h > 1080 then
        local scale = state.osd_h / 1080
        ass.text = ass.text:gsub('\\fs(%-?%d+)', function(n)
            return '\\fs' .. math.floor(tonumber(n) * scale)
        end)
    end
    mp.set_osd_ass(w, h, ass.text)
end

function render()
    local ass = assdraw.ass_new()
    local w = state.osd_w
    local h = state.osd_h

    if state.splash then
        draw_splash(ass, w, h)
        render_osd(ass, w, h)
        return
    end

    if state.up_next then
        draw_up_next(ass, w, h)
    end

    if state.clearlogo then
        draw_clearlogo(ass, w, h)
    end

    if not state.visible and not popup.active then
        render_osd(ass, w, h)
        return
    end

    -- Gradient background
    draw_gradient(ass, w, h)

    -- Layout coordinates
    local bar_y = h
    local seek_y = bar_y - 30
    local seek_h = 3
    local seek_x = 50
    local time_margin = 60
    local seek_width = w - seek_x * 2 - time_margin * 2 - 160
    local btn_y = bar_y - 85
    local btn_cy = btn_y + 4
    local skip_y = bar_y - 130

    -- Seek bar background
    ass:new_event()
    ass:append('{\\an7}{\\pos(0,0)}')
    ass:append('{\\1c&H333333&\\1a&H00&}')
    ass:draw_start()
    ass:rect_cw(seek_x, seek_y, seek_x + seek_width, seek_y + seek_h)
    ass:draw_stop()

    -- Seek bar fill
    local progress = state.duration > 0 and state.time_pos / state.duration or 0
    local fg_w = seek_width * progress
    local seek_focused = (state.row == 2)
    local fg_h = seek_focused and 5 or seek_h

    if fg_w > 0 then
        ass:new_event()
        ass:append('{\\an7}{\\pos(0,0)}')
        ass:append('{\\1c' .. accent .. '\\1a&H00&}')
        ass:draw_start()
        ass:rect_cw(seek_x, seek_y + (seek_h - fg_h) / 2, seek_x + fg_w, seek_y + (seek_h - fg_h) / 2 + fg_h)
        ass:draw_stop()

        -- Position dot
        local dot_x = seek_x + fg_w
        local dot_r = seek_focused and 6 or 4
        ass:new_event()
        ass:append('{\\an7}{\\pos(0,0)}')
        ass:append('{\\1c' .. accent .. '\\1a&H00&}')
        ass:draw_start()
        ass:round_rect_cw(dot_x - dot_r, seek_y + seek_h / 2 - dot_r, dot_x + dot_r, seek_y + seek_h / 2 + dot_r, dot_r)
        ass:draw_stop()
    end

    -- Seek bar focus highlight
    if seek_focused then
        ass:new_event()
        ass:append('{\\an7}{\\pos(0,0)}')
        ass:append('{\\3c' .. accent .. '\\3a&H00&\\1a&HFF&\\bord2}')
        ass:draw_start()
        ass:round_rect_cw(seek_x - 6, seek_y - 8, seek_x + seek_width + 6, seek_y + seek_h + 8, 4)
        ass:draw_stop()
    end

    -- Time: current (left)
    local time_str = format_time(state.time_pos)
    ass:new_event()
    ass:append('{\\an1}')
    ass:pos(seek_x, seek_y + 10)
    ass:append('{\\fs14\\1c' .. white .. '}')
    ass:append(time_str)

    -- Time: remaining (right)
    local remaining = state.duration - state.time_pos
    local remain_str = '-' .. format_time(remaining > 0 and remaining or 0)
    ass:new_event()
    ass:append('{\\an3}')
    ass:pos(seek_x + seek_width, seek_y + 10)
    ass:append('{\\fs14\\1c' .. gray .. '}')
    ass:append(remain_str)

    -- Speed indicator
    if state.speed ~= 1 then
        local speed_str = string.format('%.0fx', state.speed)
        ass:new_event()
        ass:append('{\\an3}')
        ass:pos(seek_x + seek_width + time_margin + 10, seek_y - 2)
        ass:append('{\\fs14\\1c' .. accent .. '\\b1}')
        ass:append(speed_str)
    end

    -- Button row
    local btns = get_buttons()

    -- Separate into skip, center (transport), and right (settings)
    local skip_btn = nil
    local center_btns = {}
    local right_btns = {}
    for _, btn in ipairs(btns) do
        if btn.id == 'skip' then
            skip_btn = btn
        elseif btn.id == 'audio' or btn.id == 'subs' or btn.id == 'aspect' then
            right_btns[#right_btns + 1] = btn
        else
            center_btns[#center_btns + 1] = btn
        end
    end

    -- Calculate center group position
    local gap = 22
    local center_total = 0
    for i, btn in ipairs(center_btns) do
        center_total = center_total + btn.w
        if i < #center_btns then center_total = center_total + gap end
    end
    local center_start = (w - center_total) / 2

    -- Position center buttons
    local cx = center_start
    for _, btn in ipairs(center_btns) do
        btn.x = cx
        btn.cx = cx + btn.w / 2
        cx = cx + btn.w + gap
    end

    -- Position skip button (left of center group)
    if skip_btn then
        skip_btn.x = center_start - 28 - skip_btn.w
        skip_btn.cx = skip_btn.x + skip_btn.w / 2
    end

    -- Position right group
    local right_gap = 12
    local right_total = 0
    for i, btn in ipairs(right_btns) do
        right_total = right_total + btn.w
        if i < #right_btns then right_total = right_total + right_gap end
    end
    local right_start = w - right_total - 50
    local rx = right_start
    for _, btn in ipairs(right_btns) do
        btn.x = rx
        btn.cx = rx + btn.w / 2
        rx = rx + btn.w + right_gap
    end

    -- Render all buttons
    local all_btns = {}
    for _, b in ipairs(btns) do all_btns[#all_btns + 1] = b end

    for i, btn in ipairs(all_btns) do
        local is_focused = (state.row == 1 and state.focus == i)
        local color = is_focused and accent or white

        if btn.id == 'skip' then
            -- Skip intro: floating pill
            local pill_w = btn.w
            local pill_h = 36
            local pill_x = btn.x
            local pill_y = skip_y
            ass:new_event()
            ass:append('{\\an7}{\\pos(0,0)}')
            ass:append('{\\1c&H1A1A1A&\\1a&H20&}')
            ass:draw_start()
            ass:round_rect_cw(pill_x, pill_y, pill_x + pill_w, pill_y + pill_h, 6)
            ass:draw_stop()
            ass:new_event()
            ass:append('{\\an7}{\\pos(0,0)}')
            ass:append('{\\3c' .. white .. '\\3a&H80&\\1a&HFF&\\bord1}')
            ass:draw_start()
            ass:round_rect_cw(pill_x, pill_y, pill_x + pill_w, pill_y + pill_h, 6)
            ass:draw_stop()
            ass:new_event()
            ass:append('{\\an5}')
            ass:pos(btn.cx, pill_y + pill_h / 2 + 1)
            ass:append('{\\fs18\\1c' .. (is_focused and accent or white) .. '\\b1}')
            ass:append(btn.label)
        elseif btn.id == 'play' then
            -- Play/pause: larger icon
            local icon = state.paused and '\u{25B6}' or '\u{25AE}\u{25AE}'
            ass:new_event()
            ass:append('{\\an5}')
            ass:pos(btn.cx, btn_cy)
            ass:append('{\\fs36\\1c' .. color .. '}')
            ass:append(icon)
        elseif btn.icon then
            ass:new_event()
            ass:append('{\\an5}')
            ass:pos(btn.cx, btn_cy)
            ass:append('{\\fs28\\1c' .. color .. '}')
            ass:append(btn.icon)
        elseif btn.label then
            ass:new_event()
            ass:append('{\\an5}')
            ass:pos(btn.cx, btn_cy)
            ass:append('{\\fs18\\1c' .. color .. '\\b1}')
            ass:append(btn.label)
        end


    end

    -- Popup overlay
    draw_popup(ass, w, h)

    render_osd(ass, w, h)
end

-- Up-next countdown
local function start_up_next_countdown()
    if state.up_next_timer then state.up_next_timer:kill() end
    state.up_next_countdown = state.up_next_countdown or 10
    state.up_next_timer = mp.add_periodic_timer(1, function()
        state.up_next_countdown = state.up_next_countdown - 1
        if state.up_next_countdown <= 0 then
            if state.up_next_timer then state.up_next_timer:kill() end
            state.up_next_timer = nil
            if state.autoplay then
                state.up_next = nil
                mp.command('quit 42')
            else
                state.up_next_countdown = 0
            end
        end
        render()
    end)
end

local function stop_up_next_countdown()
    if state.up_next_timer then
        state.up_next_timer:kill()
        state.up_next_timer = nil
    end
    state.up_next_countdown = 10
end

-- Key handler
local function on_key(key)
    -- Popup navigation takes priority
    if popup.active then
        if key == 'up' then
            popup.focus = popup.focus - 1
            if popup.focus < 1 then popup.focus = #popup.items end
            if popup.focus <= popup.scroll then
                popup.scroll = popup.focus - 1
            end
            if popup.focus > popup.scroll + MAX_POPUP_ITEMS then
                popup.scroll = popup.focus - MAX_POPUP_ITEMS
            end
            render()
        elseif key == 'down' then
            popup.focus = popup.focus + 1
            if popup.focus > #popup.items then popup.focus = 1 end
            if popup.focus > popup.scroll + MAX_POPUP_ITEMS then
                popup.scroll = popup.focus - MAX_POPUP_ITEMS
            end
            if popup.focus <= popup.scroll then
                popup.scroll = popup.focus - 1
            end
            render()
        elseif key == 'enter' then
            select_popup_item()
        elseif key == 'esc' or key == 'back' then
            close_popup()
        end
        return
    end

    if not state.visible then
        if key == 'enter' then
            show_osd()
        elseif key == 'space' then
            reset_speed()
            mp.commandv('cycle', 'pause')
            show_osd()
        elseif key == 'left' then
            do_seek('left')
        elseif key == 'right' then
            do_seek('right')
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
            if state.row == 2 then
                do_seek('left')
                show_osd()
            else
                move_focus(-1)
            end
        elseif key == 'right' then
            if state.row == 2 then
                do_seek('right')
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

-- Property observers
mp.observe_property('pause', 'bool', function(_, value)
    state.paused = value
    render()
end)

mp.observe_property('time-pos', 'number', function(_, value)
    state.time_pos = value or 0
    if state.splash and state.time_pos > 0 then
        msg.info('fynix-osc: time-pos > 0, hiding splash')
        if state.splash_timer then
            state.splash_timer:kill()
            state.splash_timer = nil
        end
        state.splash = false
    end
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

-- Script message handlers
mp.register_script_message('show-splash', function()
    state.splash = true
    state.splash_dots = ''
    if state.splash_timer then state.splash_timer:kill() end
    state.splash_timer = mp.add_periodic_timer(0.5, update_splash_spinner)
    render()
end)

mp.register_script_message('hide-splash', function()
    state.splash = false
    if state.splash_timer then
        state.splash_timer:kill()
        state.splash_timer = nil
    end
end)

mp.register_script_message('show-skip-intro', function(endMs)
    state.skip_intro_end = tonumber(endMs)
    show_osd()
end)

mp.register_script_message('set-has-next', function(hasNext)
    state.has_next = hasNext == 'true'
    render()
end)

mp.register_script_message('set-autoplay-next', function(v)
    state.autoplay = (v == 'true')
    render()
end)

mp.register_script_message('hide-skip-intro', function()
    state.skip_intro_end = nil
    render()
end)

mp.register_script_message('set-clearlogo', function(text)
    msg.info('fynix-osc: set-clearlogo received: ' .. tostring(text))
    state.clearlogo = text or nil
    render()
end)

mp.register_script_message('clear-clearlogo', function()
    msg.info('fynix-osc: clear-clearlogo received')
    state.clearlogo = nil
    render()
end)

mp.register_script_message('set-plot', function(text)
    local truncated = text and #text > 100 and text:sub(1, 100) .. '...' or text
    msg.info('fynix-osc: set-plot received: ' .. tostring(truncated))
end)

mp.register_script_message('set-up-next', function(_, title, subtitle, countdown)
    state.up_next = {
        title = title or '',
        subtitle = subtitle or '',
    }
    local cd = tonumber(countdown) or 10
    state.up_next_countdown = cd
    start_up_next_countdown()
    show_osd()
end)

mp.register_script_message('clear-up-next', function()
    state.up_next = nil
    stop_up_next_countdown()
    render()
end)

mp.register_script_message('fynix-osc-key', function(key)
    if key == 'click' then
        show_osd()
    else
        on_key(key)
    end
end)

mp.register_script_message('thumbfast-info', function(json)
    local ok, info = pcall(function() return utils.parse_json(json) end)
    if ok and info then
        if info.disabled then
            state.thumbfast = nil
            msg.info('fynix-osc: thumbfast disabled for this stream')
        else
            state.thumbfast = info
            msg.info('fynix-osc: thumbfast-info received: ' .. tostring(info.width) .. 'x' .. tostring(info.height))
        end
    end
end)

msg.info('fynix-osc.lua script loaded successfully')

-- Auto-show splash on startup
state.splash = true
state.splash_dots = ''
state.splash_timer = mp.add_periodic_timer(0.5, update_splash_spinner)
msg.info('fynix-osc: splash auto-shown')

render()
