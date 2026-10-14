import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook()
ws = wb.active
ws.title = '預設信用卡'

headers = [
    '卡片名稱', '銀行', '末四碼', '結帳日', '取整', '顏色', '卡片備註',
    '通路類型', '回饋%', '每期消費上限', '重置方式', '通路', '規則備註', '活動結束', '啟用'
]

cards_data = [
    {
        'name': '永豐大戶卡',
        'bank': '永豐銀行',
        'last4': '',
        'statementDay': 5,
        'rounding': '四捨五入',
        'color': '#1e1e1e',
        'note': '需具備大戶數位帳戶大大/大戶等級與電子帳單',
        'rules': [
            {'type': '實體|網路', 'rate': 6, 'cap': 25000, 'channels': '海外實體|外幣消費', 'note': '海外與外幣消費享最高 6%', 'validTo': '2026-12-31'},
            {'type': '實體|網路', 'rate': 5, 'cap': 25000, 'channels': '全通路(排除超商量販/繳費平台/小額支付/交通儲值/稅款/醫療費/罰款/境外投資)', 'note': '大戶等級全通路指定加碼', 'validTo': '2026-12-31'},
            {'type': '實體', 'rate': 5, 'cap': 10000, 'channels': '悠遊卡自動加值', 'note': '悠遊卡自動加值享 5% (上限 500 元)', 'validTo': '2026-12-31'},
            {'type': '實體|網路|行動支付', 'rate': 1, 'cap': None, 'channels': '一般消費', 'note': '國內外一般消費基本 1% 無上限', 'validTo': '2026-12-31'},
        ]
    },
    {
        'name': '永豐Sport卡',
        'bank': '永豐銀行',
        'last4': '',
        'statementDay': 5,
        'rounding': '捨去',
        'color': '#f97316',
        'note': '需下載汗水不白流 App 並每月消耗 10,000 大卡達標',
        'rules': [
            {'type': '實體|網路|行動支付', 'rate': 5, 'cap': 10000, 'channels': 'Apple Pay|App Store|Steam|藥妝', 'note': '汗水 > 10,000 大卡享指定支付/通路 5% 加碼', 'validTo': '2026-12-31'},
            {'type': '實體|網路|行動支付', 'rate': 1, 'cap': None, 'channels': '一般消費', 'note': '一般消費基本 1% 無上限', 'validTo': '2026-12-31'},
        ]
    },
    {
        'name': '星展傳說卡',
        'bank': '星展銀行',
        'last4': '',
        'statementDay': 16,
        'rounding': '四捨五入',
        'color': '#7c3aed',
        'note': '星展傳說對決聯名卡，指定遊戲影音外送高回饋',
        'rules': [
            {'type': '實體|網路', 'rate': 10, 'cap': 3333, 'channels': 'App Store|Steam|NOVA|售票網|外送平台|蝦皮|淘寶|麥當勞|肯德基|影音平台|Twitch', 'note': '指定遊戲影音外送享最高 10% (可刷約 3,333 元)', 'validTo': '2026-12-31'},
            {'type': '實體|行動支付', 'rate': 5, 'cap': 12500, 'channels': '日本實體|韓國實體|泰國實體|新加坡實體|美洲實體|歐洲實體|海外Apple Pay', 'note': '限日/韓/泰/新/美/歐實體門市或 Apple Pay', 'validTo': '2026-12-31'},
            {'type': '實體|網路|行動支付', 'rate': 1, 'cap': None, 'channels': '一般消費', 'note': '國內一般消費基本 1% 無上限', 'validTo': '2026-12-31'},
        ]
    },
    {
        'name': '永豐幣倍卡',
        'bank': '永豐銀行',
        'last4': '',
        'statementDay': 5,
        'rounding': '捨去',
        'color': '#0284c7',
        'note': '需綁定永豐外幣存款帳戶與自動扣繳',
        'rules': [
            {'type': '網路', 'rate': 6, 'cap': 20000, 'channels': '淘寶|iHerb|OliveYoung|Airbnb|Booking.com|旅行社|飯店|航空|Trip.com|KKDAY|Klook', 'note': '指定國外網購與線上旅遊加碼最高 6%', 'validTo': '2026-12-31'},
            {'type': '實體', 'rate': 6, 'cap': 20000, 'channels': '海外實體|日本交通卡儲值|Suica|PASMO', 'note': '海外實體門市與日本交通卡儲值最高 6%', 'validTo': '2026-12-31'},
            {'type': '實體|網路|行動支付', 'rate': 1, 'cap': None, 'channels': '一般消費', 'note': '國內一般消費基本 1% 無上限', 'validTo': '2026-12-31'},
        ]
    },
    {
        'name': '國泰CUBE卡',
        'bank': '國泰世華',
        'last4': '',
        'statementDay': 3,
        'rounding': '四捨五入',
        'color': '#005596',
        'note': '每日可於 CUBE App 切換方案，未切換以一般消費計',
        'rules': [
            {'type': '網路', 'rate': 3.3, 'cap': None, 'channels': 'App Store|網購|AI工具|Duolingo|Google Play', 'note': '需切換「玩數位」方案', 'validTo': '2026-12-31'},
            {'type': '實體|網路', 'rate': 3.3, 'cap': None, 'channels': '百貨|外送|餐廳|藥妝|Uber Eats|foodpanda|王品', 'note': '需切換「樂饗購」方案', 'validTo': '2026-12-31'},
            {'type': '實體|網路', 'rate': 3.3, 'cap': None, 'channels': 'Grab|航空|飯店|旅行社|租車', 'note': '需切換「趣旅行」方案', 'validTo': '2026-12-31'},
            {'type': '實體', 'rate': 3.3, 'cap': None, 'channels': '海外實體消費', 'note': '需切換「趣旅行」海外實體', 'validTo': '2026-12-31'},
            {'type': '實體', 'rate': 2, 'cap': None, 'channels': '超市|中油|7-11|全家|全聯|家樂福', 'note': '需切換「集精選」方案', 'validTo': '2026-12-31'},
            {'type': '實體|網路|行動支付', 'rate': 0.3, 'cap': None, 'channels': '一般消費', 'note': '基本回饋或未切換方案', 'validTo': '2026-12-31'},
        ]
    },
    {
        'name': '玉山Ubear卡',
        'bank': '玉山銀行',
        'last4': '',
        'statementDay': 3,
        'rounding': '四捨五入',
        'color': '#e11d48',
        'note': '申辦電子帳單享網購與指定影音娛樂高回饋',
        'rules': [
            {'type': '網路', 'rate': 10, 'cap': 1000, 'channels': 'Nintendo|Netflix|Steam|Gemini|Spotify|Disney+', 'note': '指定娛樂影音 10% (每期上限 100 元)', 'validTo': '2027-02-28'},
            {'type': '網路', 'rate': 3, 'cap': 7500, 'channels': '國內外線上消費|蝦皮|momo|PChome|酷澎', 'note': '網購 3% (含基本 1% + 加碼 2%)', 'validTo': '2027-02-28'},
            {'type': '實體|網路|行動支付', 'rate': 1, 'cap': None, 'channels': '一般消費', 'note': '國內外一般消費基本 1% 無上限', 'validTo': '2027-02-28'},
        ]
    },
    {
        'name': '聯邦LINE卡',
        'bank': '聯邦銀行',
        'last4': '',
        'statementDay': 3,
        'rounding': '四捨五入',
        'color': '#06c755',
        'note': '需申辦電子帳單，享指定網購加碼回饋',
        'rules': [
            {'type': '網路', 'rate': 4, 'cap': 10000, 'channels': 'momo|PChome|酷澎|淘寶|蝦皮|Steam', 'note': '指定網購加碼 4% (每期加碼上限 300 元)', 'validTo': '2027-07-31'},
            {'type': '實體|網路|行動支付', 'rate': 2, 'cap': None, 'channels': '一般消費', 'note': '國內一般消費 2% 無上限', 'validTo': '2027-07-31'},
        ]
    },
    {
        'name': '中信中油卡',
        'bank': '中國信託',
        'last4': '',
        'statementDay': 5,
        'rounding': '四捨五入',
        'color': '#0284c7',
        'note': '綁定中油Pay並於指定日線上儲值享最高回饋',
        'rules': [
            {'type': '行動支付', 'rate': 6.8, 'cap': None, 'channels': '中油Pay|台灣中油', 'note': '週一儲值中油Pay單筆滿3000元最高享6.8%', 'validTo': '2026-12-31'},
            {'type': '實體|網路|行動支付', 'rate': 0.5, 'cap': None, 'channels': '一般消費', 'note': '一般消費基本中信紅利點數', 'validTo': '2026-12-31'},
        ]
    },
    {
        'name': '聯邦吉鶴卡',
        'bank': '聯邦銀行',
        'last4': '',
        'statementDay': 3,
        'rounding': '四捨五入',
        'color': '#b91c1c',
        'note': '赴日旅遊神卡，日系餐廳與日本品牌享專屬加碼',
        'rules': [
            {'type': '實體', 'rate': 10, 'cap': None, 'channels': '勝博殿|一風堂|欣葉日本料理|頑味食堂|日系餐廳', 'note': '國內指定日系名店享最高現折/回饋 10%', 'validTo': '2026-12-31'},
            {'type': '實體|網路', 'rate': 5, 'cap': 12500, 'channels': 'UQ|GU|UNIQLO|GU網路商店|日牌實體店|唐吉訶德|大創|無印良品', 'note': '指定日牌門市與官網加碼 5% (可刷 12,500 元)', 'validTo': '2026-12-31'},
            {'type': '實體|網路|行動支付', 'rate': 1.5, 'cap': None, 'channels': '一般消費', 'note': '國內一般消費 1.5% 無上限', 'validTo': '2026-12-31'},
        ]
    },
    {
        'name': '星展永續卡',
        'bank': '星展銀行',
        'last4': '',
        'statementDay': 16,
        'rounding': '四捨五入',
        'color': '#15803d',
        'note': '星展 eco 永續卡，享指定國家海外實體及 Apple Pay 加碼',
        'rules': [
            {'type': '實體|行動支付', 'rate': 5, 'cap': 15000, 'channels': '日本實體|韓國實體|泰國實體|新加坡實體|美洲實體|歐洲實體|海外Apple Pay', 'note': '限日/韓/泰/新/美/歐實體門市或 Apple Pay', 'validTo': '2026-12-31'},
            {'type': '實體|網路|行動支付', 'rate': 1.5, 'cap': None, 'channels': '一般消費', 'note': '國內外一般消費 1.5% 現金積點無上限', 'validTo': '2026-12-31'},
        ]
    },
    {
        'name': '星展極簡卡',
        'bank': '星展銀行',
        'last4': '',
        'statementDay': 16,
        'rounding': '四捨五入',
        'color': '#475569',
        'note': '星展極簡卡，享海外指定國家實體及 Apple Pay 加碼',
        'rules': [
            {'type': '實體|行動支付', 'rate': 5, 'cap': 15000, 'channels': '日本實體|韓國實體|泰國實體|新加坡實體|美洲實體|海外Apple Pay', 'note': '限日/韓/泰/新/美實體門市或 Apple Pay', 'validTo': '2026-12-31'},
            {'type': '實體|網路|行動支付', 'rate': 1.2, 'cap': None, 'channels': '一般消費', 'note': '基本國內外現金回饋無上限', 'validTo': '2026-12-31'},
        ]
    },
]

# Write headers
ws.append(headers)

# Styling definitions
header_font = Font(name='Segoe UI', size=11, bold=True, color='FFFFFF')
header_fill = PatternFill(start_color='1E293B', end_color='1E293B', fill_type='solid')
header_align = Alignment(horizontal='center', vertical='center', wrap_text=True)

thin_border = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='thin', color='CBD5E1'),
    top=Side(style='thin', color='CBD5E1'),
    bottom=Side(style='thin', color='CBD5E1')
)
card_top_border = Border(
    left=Side(style='thin', color='CBD5E1'),
    right=Side(style='thin', color='CBD5E1'),
    top=Side(style='medium', color='64748B'),
    bottom=Side(style='thin', color='CBD5E1')
)

fill_white = PatternFill(start_color='FFFFFF', end_color='FFFFFF', fill_type='solid')
fill_alt = PatternFill(start_color='F8FAFC', end_color='F8FAFC', fill_type='solid')

# Apply header styles
ws.row_dimensions[1].height = 28
for col_idx in range(1, 16):
    cell = ws.cell(row=1, column=col_idx)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = header_align
    cell.border = thin_border

csv_lines = [
    '# 預設信用卡資料檔 (UTF-8 BOM) - 完整填寫指南與表格範例請參閱 deploy-guide.html',
    ','.join(headers)
]

row_num = 2
for card_idx, card in enumerate(cards_data):
    card_fill = fill_white if card_idx % 2 == 0 else fill_alt
    for r_idx, rule in enumerate(card['rules']):
        is_first = (r_idx == 0)
        row_vals = [
            card['name'] if is_first else '',
            card['bank'] if is_first else '',
            card['last4'] if is_first else '',
            card['statementDay'] if is_first else '',
            card['rounding'] if is_first else '',
            card['color'] if is_first else '',
            card['note'] if is_first else '',
            rule['type'],
            rule['rate'],
            rule['cap'] if rule['cap'] is not None else '',
            '結帳日',
            rule['channels'],
            rule['note'],
            rule['validTo'],
            '是'
        ]
        ws.append(row_vals)
        ws.row_dimensions[row_num].height = 22
        border_to_use = card_top_border if is_first else thin_border

        # CSV row formatting
        csv_row = []
        for val in row_vals:
            s = str(val) if val is not None else ''
            if any(ch in s for ch in [',', '"', '\n', '\r']):
                s = '"' + s.replace('"', '""') + '"'
            csv_row.append(s)
        csv_lines.append(','.join(csv_row))
        
        for col_idx in range(1, 16):
            cell = ws.cell(row=row_num, column=col_idx)
            cell.font = Font(name='Segoe UI', size=10)
            cell.fill = card_fill
            cell.border = border_to_use
            
            # Alignments
            if col_idx in (1, 2, 7, 12, 13):
                cell.alignment = Alignment(horizontal='left', vertical='center')
            elif col_idx in (3, 4, 5, 6, 8, 11, 14, 15):
                cell.alignment = Alignment(horizontal='center', vertical='center')
            elif col_idx in (9, 10):
                cell.alignment = Alignment(horizontal='right', vertical='center')
                if col_idx == 10 and isinstance(cell.value, (int, float)):
                    cell.number_format = '#,##0'
                    
        row_num += 1

# Auto-fit column widths
col_widths = {
    1: 18, 2: 14, 3: 10, 4: 10, 5: 12, 6: 12, 7: 34,
    8: 24, 9: 12, 10: 16, 11: 12, 12: 44, 13: 36, 14: 14, 15: 10
}
for col_idx, width in col_widths.items():
    ws.column_dimensions[get_column_letter(col_idx)].width = width

ws.freeze_panes = 'A2'
ws.auto_filter.ref = f'A1:O{row_num - 1}'

wb.save('public/default-cards.xlsx')
wb.save('default-cards.xlsx')

with open('public/default-cards.csv', 'w', encoding='utf-8-sig', newline='\r\n') as f:
    f.write('\r\n'.join(csv_lines) + '\r\n')

print('Successfully generated default-cards.xlsx and default-cards.csv!')
