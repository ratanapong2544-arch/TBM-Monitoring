# 🏗️ โครงสร้างระบบ Tunnel Boring Monitoring App (TBM1 System)

เอกสารนี้จัดทำขึ้นเพื่อใช้เป็น **แผนผังและข้อมูลอ้างอิง (Reference Guide)** สำหรับโปรเจกต์ TBM Monitoring App 
โดยมีวัตถุประสงค์เพื่อช่วยให้คุณสามารถคัดลอกข้อมูลในส่วนที่เกี่ยวข้องไปใช้ "สั่งงาน AI ให้แก้ไขทีละส่วน" ได้อย่างแม่นยำและประหยัดโควต้าการสนทนา

---

## 💻 1. เทคโนโลยีหลักที่ใช้ (Tech Stack)
- **Frontend Framework:** React 18 (CRA - Create React App)
- **Styling:** Tailwind CSS (ผ่าน `className`) + Custom CSS (`globals.css`)
- **Icons:** `lucide-react`
- **Charts / Graphs:** `recharts`
- **Backend / Database:** Google Apps Script (GAS) เชื่อมต่อผ่าน API (`fetch`)

---

## 📂 2. โครงสร้างโฟลเดอร์และไฟล์ (Directory Structure)

โปรเจกต์ทั้งหมดทำงานอยู่ภายใต้โฟลเดอร์ `src/` โดยแบ่งสัดส่วนการทำงานดังนี้:

```text
src/
├── App.jsx                      # ไฟล์หลัก (Entry Point) ที่ควบคุม State และการเปลี่ยนหน้า (Routing)
├── index.tsx                    # ไฟล์เริ่มการทำงานของ React
├── App.d.ts                     # TypeScript definitions
├── components/                  # แหล่งรวม UI Components ทั้งหมด
│   ├── common/                  # 🧩 คอมโพเนนต์ที่ใช้ซ้ำได้ในหลายๆ หน้า
│   │   ├── RingVisualizer.jsx   # ตัวแสดงภาพกราฟิกวงแหวนและ Segment
│   │   └── StatCard.jsx         # การ์ดแสดงผลตัวเลขสถิติ
│   │
│   └── views/                   # 📄 หน้าจอหลักต่างๆ ของแอปพลิเคชัน (จำแนกตาม Tab)
│       ├── ExecutiveDashboardView.jsx  # แดชบอร์ดภาพรวมสำหรับผู้บริหาร (Dashboard)
│       ├── GroutDashboardView.jsx      # หน้าดูประวัติและการวิเคราะห์ Grout (Data Log)
│       ├── GroutRecordView.jsx         # หน้าฟอร์มสำหรับบันทึกข้อมูล Grout (Record)
│       ├── OverviewView.jsx            # หน้าแรกสรุปสถานะปัจจุบัน (Home)
│       ├── ReportView.jsx              # หน้ารายงานสถิติเชิงลึก (Stats)
│       ├── SegmentDashboardView.jsx    # หน้าดูประวัติข้อมูลวงแหวน Segment (Data Log)
│       ├── SegmentRecordView.jsx       # หน้าฟอร์มสำหรับบันทึกข้อมูล Segment (Record)
│       └── ShiftReportView.jsx         # หน้าจัดการและรายงานกะการทำงาน (Shift Report)
├── styles/                      # ไฟล์กำหนดสไตล์
│   └── globals.css              # ไฟล์ตั้งค่า Tailwind และสไตล์หลัก
├── styles.css                   # สไตล์อื่นๆ เสริม
└── utils/                       # 🛠️ ฟังก์ชันช่วยเหลือ (Helper Functions)
    ├── api.js                   # จัดการการเชื่อมต่อ API / ดึงข้อมูล
    ├── constants.js             # เก็บค่าคงที่ เช่น `GAS_URL`
    ├── formatters.js            # ฟังก์ชันจัดรูปแบบข้อความ, วันที่, เวลา
    └── helpers.js               # ฟังก์ชันประมวลผลทั่วไป (เช่น `safeParseJSON`)
```

---

## 🧩 3. การจัดการสถานะข้อมูลส่วนกลาง (Global State)
ข้อมูลทั้งหมดถูกดึงและจัดการที่เมนหลักคือไฟล์ `App.jsx` ก่อนถูกส่งต่อไปยังหน้าหรือ Component ต่างๆ ผ่าน Props โดย State หลักมีดังนี้:

- `segmentRecords` (Array) - เก็บข้อมูลประวัติการขุดเจาะและติดตั้งแต่ล่ะ Ring
- `groutRecords` (Array) - เก็บข้อมูลการฉีดซีเมนต์
- `shiftReports` (Array) - เก็บข้อมูลของแต่ละกะเวลา (กำลังคน, ปัญหาที่พบ ฯลฯ)
- `projectInfo` (Object) - เก็บรายละเอียดโปรเจกต์ เช่น วันที่, กะ, สถานที่ทำงาน, รหัสหัวเจาะ TBM
- `currentModule` / `activeTab` - ตัวควบคุมการแสดงผลหน้าจอปัจจุบัน

---

## 📋 4. แนวทางการสั่งงาน AI เพื่อลดโควต้า (Prompting Guide)

เวลาที่คุณต้องการแก้ไขหรือเพิ่มฟีเจอร์ ให้คัดลอกส่วนนี้ พร้อมระบุเป้าหมาย เพื่อให้ AI ดึงเฉพาะไฟล์ที่เกี่ยวข้องขึ้นมาวิเคราะห์และแก้ไขเท่านั้น:

### 🔸 กรณีที่ 1: ต้องการแก้ UI/เพิ่มกราฟที่หน้า Dashboard
> **ตัวอย่างคำสั่ง:** "เราต้องการแก้ไขหน้าแดชบอร์ดผู้บริหารให้แสดงกราฟเพิ่มเติม ในส่วนของ Tab Overview ให้โฟกัสไปที่ไฟล์ `src/components/views/ExecutiveDashboardView.jsx`"

### 🔸 กรณีที่ 2: ต้องการปรับแก้ฟอร์มการบันทึกข้อมูล (Record)
> **ตัวอย่างคำสั่ง:** "ต้องการเพิ่มช่องกรอกข้อมูลแรงดันน้ำในระหว่างฉีดซีเมนต์ ให้เปิดเช็คไฟล์ `src/components/views/GroutRecordView.jsx` และดูไฟล์ `App.jsx` ว่าต้องอัปเดต state หรือส่ง props ไหม"

### 🔸 กรณีที่ 3: ต้องการแก้ไขตารางประวัติข้อมูล (Data Log)
> **ตัวอย่างคำสั่ง:** "ตารางแสดงผลใน Data Log ของ Segment เรียงลำดับผิด ช่วยแก้ไขที่ไฟล์ `src/components/views/SegmentDashboardView.jsx` ให้เรียงจากล่าสุดไปเก่าสุด"

### 🔸 กรณีที่ 4: เปลี่ยนแปลงการตั้งค่าหรือการเชื่อมต่อ Database
> **ตัวอย่างคำสั่ง:** "เราเปลี่ยน Google Sheets ตัวใหม่ ช่วยตรวจสอบการตั้งค่า URL และการดึงข้อมูลที่ `src/utils/constants.js`, `src/utils/api.js` และ `src/App.jsx` ในส่วนของ `useEffect()`"

### 🔸 กรณีที่ 5: แก้ไขกราฟิกวงแหวน / คอมโพเนนต์ที่ใช้ซ้ำ
> **ตัวอย่างคำสั่ง:** "ต้องการเปลี่ยนสีสถานะของวงแหวนจากเดิมเป็นสีแดงเมื่อมีปัญหา ให้ไปแก้ที่คอมโพเนนต์ส่วนกลางที่ไฟล์ `src/components/common/RingVisualizer.jsx`"

---
*💡 ทริค: แนะนำให้แนบข้อความของ "กรณีที่... / ตัวอย่างคำสั่ง" แบบนี้ไปพร้อมอธิบายความต้องการจริงของคุณ จะทำให้ระบบจำกัดขอบเขตการทำงานได้ตรงจุด ลดระยะเวลาวิเคราะห์ไฟล์อื่นๆ ในโปรเจกต์ที่ไม่เกี่ยวข้องและประหยัดโควต้าครับ*
