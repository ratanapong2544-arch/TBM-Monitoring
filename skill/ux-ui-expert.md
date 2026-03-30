---
name: UX/UI Design Expert
description: ทักษะและแนวทางปฏิบัติที่ดีที่สุดสำหรับการออกแบบและพัฒนา UI/UX โดยเน้นที่การใช้งานจริง, Accessibility, และ Design System
version: 1.0.0
---
# 🎨 UX/UI Design Expert Skill

เมื่อคุณได้รับมอบหมายให้สร้าง, แก้ไข, หรือแนะนำเกี่ยวกับ User Interface (UI) และ User Experience (UX) ให้ปฏิบัติตามกฎกติกาและแนวทางเหล่านี้อย่างเคร่งครัด เพื่อให้ผลลัพธ์ออกมาในระดับ Professional

## 1. Design System & Consistency (ความสม่ำเสมอและระบบการออกแบบ)

- **ใช้ Design Tokens:** พยายามใช้ CSS Variables, Tailwind Utility Classes หรือ Design Tokens ที่มีอยู่ในโปรเจกต์เสมอ (เช่น `var(--color-primary)` หรือ `text-blue-600`) หลีกเลี่ยงการ Hardcode ค่าสีหรือขนาด (Magic Numbers)
- **Spacing & Typography:** รักษาระยะห่าง (Margin/Padding) ให้เป็นสัดส่วนเดียวกันทั้งโปรเจกต์ (เช่น ระบบ 4pt หรือ 8pt grid) และใช้ลำดับชั้นของตัวอักษร (Typography Hierarchy - H1, H2, H3, Body) ให้ชัดเจน
- **Component Reusability:** ออกแบบ UI ให้เป็น Component ที่สามารถนำไปใช้ซ้ำได้ หลีกเลี่ยงการเขียนโค้ด UI ที่ผูกติดกับ Business Logic มากเกินไป

## 2. Accessibility (a11y) (การเข้าถึงของผู้ใช้ทุกคน)

- **Semantic HTML:** ใช้ Tag HTML ให้ถูกความหมายเสมอ (เช่น `<button>` สำหรับกดสั่งการ, `<a>` สำหรับลิงก์, `<nav>`, `<main>`, `<article>`)
- **ARIA & Keyboard Navigation:** ตรวจสอบให้แน่ใจว่าองค์ประกอบที่โต้ตอบได้ (Interactive elements) รองรับการใช้งานผ่านคีย์บอร์ด (Tab navigation) และมี `aria-label` หรือ `aria-hidden` ตามความเหมาะสม
- **Color Contrast:** ตรวจสอบความเปรียบต่างของสี (Contrast Ratio) ระหว่างตัวอักษรและพื้นหลังให้ได้มาตรฐาน WCAG (AA หรือ AAA) เสมอ

## 3. Responsive & Mobile-First (การรองรับทุกขนาดหน้าจอ)

- **Mobile-First Approach:** เริ่มต้นการออกแบบหรือเขียนโค้ดจากหน้าจอขนาดเล็ก (Mobile) ก่อนเสมอ แล้วค่อยขยายไปยังหน้าจอ Tablet และ Desktop (ใช้ `@media (min-width: ...)` หรือ `md:`, `lg:` ใน Tailwind)
- **Fluid Layouts:** ใช้ Flexbox หรือ CSS Grid ในการจัดโครงสร้าง เพื่อให้ UI ยืดหยุ่นและปรับตัวตามขนาดหน้าจอได้โดยไม่พัง

## 4. User Feedback & Micro-interactions (การตอบสนองต่อผู้ใช้)

- **States:** ทุกปุ่มหรือองค์ประกอบที่คลิกได้ ต้องมีสถานะ Hover, Active, Focus, และ Disabled ที่มองเห็นได้ชัดเจน
- **Loading & Error States:** เมื่อมีการดึงข้อมูลหรือประมวลผล ต้องมี UI แจ้งเตือนสถานะ Loading (เช่น Skeleton loading หรือ Spinner) และหากเกิดข้อผิดพลาด ต้องมี Error Message ที่เข้าใจง่ายและบอกวิธีแก้ไขแก่ผู้ใช้
- **Empty States:** หากไม่มีข้อมูลแสดงผล (เช่น ตะกร้าสินค้าว่างเปล่า หรือค้นหาไม่พบ) ให้แสดงหน้าต่าง Empty State ที่เป็นมิตร พร้อม Call-to-Action (CTA) แนะนำผู้ใช้ว่าควรทำอะไรต่อไป

## 5. Cognitive Load & Clarity (ความเรียบง่ายและชัดเจน)

- **Chunking:** แบ่งข้อมูลที่ซับซ้อนออกเป็นส่วนๆ หรือเป็นขั้นตอน (Step-by-step / Wizard) เพื่อไม่ให้ผู้ใช้รู้สึกรับภาระทางสายตาและสมองมากเกินไป
- **Clear Call-to-Action (CTA):** ในแต่ละหน้าจอควรมีปุ่ม CTA หลัก (Primary Action) เพียงปุ่มเดียวที่โดดเด่น นอกนั้นให้เป็น Secondary หรือ Tertiary actions

---

### 🛠️ วิธีการทำงาน (Agent Instruction)

1. ก่อนเริ่มเขียนโค้ด UI ให้ตรวจสอบบริบทของโปรเจกต์ว่าใช้ Framework หรือ Library ตัวไหน (เช่น React, Vue, Tailwind, MUI) และยึดตามสไตล์นั้น
2. หากมีการร้องขอให้ "ออกแบบหน้าจอ" ให้ร่างโครงสร้าง (Layout outline) หรืออธิบายแนวคิด UX ให้ผู้ใช้รับทราบและอนุมัติก่อนลงมือเขียนโค้ด
3. เมื่อเขียนโค้ดเสร็จ ให้ทบทวน Check-list ด้าน Accessibility และ Responsive เสมอก่อนส่งมอบงาน
