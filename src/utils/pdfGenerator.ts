import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Attendance, Student, Holiday } from "../types";
import { format, getDaysInMonth, isSaturday, isSunday, parseISO, isBefore, isAfter } from "date-fns";

export const generateAttendanceReport = (
  attendanceRecords: Attendance[],
  students: Student[],
  className: string,
  divisionName: string,
  month: string, // YYYY-MM
  holidays: Holiday[],
  schoolName: string,
  classStartDate?: string
) => {
  const doc = new jsPDF("l", "mm", "a4");
  const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));
  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = getDaysInMonth(new Date(year, monthNum - 1));

  doc.setFontSize(16);
  doc.text(`Attendance Report for ${format(new Date(year, monthNum - 1), 'MMMM yyyy')}`, 14, 15);
  doc.setFontSize(12);
  doc.text(`Name of School: ${schoolName}`, 14, 22);
  doc.text(`Class & Division: ${className}-${divisionName}`, 14, 29);
 
  const classStartDateObj = classStartDate ? (classStartDate.includes('-') ? parseISO(classStartDate) : new Date(classStartDate)) : null;
  
  const tableColumn = [
    "Class No", 
    "Name", 
    ...Array.from({ length: daysInMonth }, (_, i) => (i + 1).toString()), 
    "Monthly Attendance %"
  ];
  const tableRows: any[] = [];

  sortedStudents.forEach((student, index) => {
    const rowData: any[] = [
      (index + 1).toString(),
      student.name,
    ];

    let presentCount = 0;
    let totalDays = 0;
    
    const admissionDate = student.admissionDate ? parseISO(student.admissionDate) : null;

    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, monthNum - 1, i);
      const dateStr = `${month}-${i.toString().padStart(2, '0')}`;
      const holiday = holidays.find(h => h.date === dateStr);

      const isDayOff = isSunday(date) || 
                       (isSaturday(date) && (!holiday || holiday.type !== 'working_saturday')) || 
                       (holiday && holiday.type === 'holiday');

      if (isDayOff) {
        const dta = holiday?.reason;
        rowData.push({ content: dta?.[index]?.toUpperCase() || '|', styles: { fillColor: [240, 240, 240], textColor: [255, 0, 0] } });
      } else if (classStartDateObj && isBefore(date, classStartDateObj)) {
        rowData.push({ content: '-', styles: { fillColor: [240, 240, 240] } });
      } else if (admissionDate && isBefore(date, admissionDate)) {
        rowData.push({ content: '-', styles: { fillColor: [240, 240, 240] } });
      } else {
        const record = attendanceRecords.find(r => r.date === dateStr);
        if (record) {
          totalDays++;
          const studentRecord = record.records.find(r => r.studentId === student.studentId);

          if (studentRecord) {
            if (studentRecord.status === 'full_day') {
              rowData.push('X');
              presentCount += 1;
            } else if (studentRecord.status === 'fn_only') {
              rowData.push('/');
              presentCount += 0.5;
            } else if (studentRecord.status === 'an_only') {
              rowData.push('\\');
              presentCount += 0.5;
            } else {
              rowData.push({ content: 'a', styles: { textColor: [255, 0, 0] } });
            }
          } else {
            rowData.push('');
          }
        } else {
          rowData.push(''); // Attendance not submitted
        }
      }
    }

    const percentage = totalDays > 0 ? ((presentCount / totalDays) * 100).toFixed(1) : "0";
    rowData.push(`${percentage}%`);
    tableRows.push(rowData);
  });

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 35,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 0.8, halign: 'center' },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontSize: 7 },
    columnStyles: { 1: { halign: 'left' } },
    didParseCell: (data) => {
      if (data.column.index >= 2 && data.column.index < 2 + daysInMonth) {
        const day = data.column.index - 1;
        const date = new Date(year, monthNum - 1, day);
      }
    }
  });

  // Add holiday details below the table
 /* let y = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  
  const monthHolidays = holidays.filter(h => h.date.startsWith(month));
  
  if (monthHolidays.length > 0) {
    doc.text("Holiday Details:", 14, y);
    y += 5;
    monthHolidays.forEach(h => {
      const [yStr, mStr, dStr] = h.date.split('-');
      doc.text(`${dStr}-${mStr}-${yStr}: ${h.reason || 'Holiday'}`, 14, y);
      y += 5;
    });
  }*/

  doc.save(`Attendance_Report_${className}_${divisionName}_${month}.pdf`);
};

export const generateYearlyAttendanceReport = (
  attendanceRecords: Attendance[],
  students: Student[],
  className: string,
  divisionName: string,
  academicYear: string, // e.g., '2025-2026'
  holidays: Holiday[],
  schoolName: string,
  classStartDate?: string
) => {
  const doc = new jsPDF("l", "mm", "a4");
  const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));
  const [startYear, endYear] = academicYear.split('-').map(Number);

  doc.setFontSize(16);
  doc.text(`Yearly Attendance Report (${academicYear})`, 14, 15);
  doc.setFontSize(12);
  doc.text(`Name of School: ${schoolName}`, 14, 22);
  doc.text(`Class & Division: ${className}-${divisionName}`, 14, 29);

  const months = [
    "June", "July", "August", "September", "October", "November", 
    "December", "January", "February", "March"
  ];
  const tableColumn = ["Class No", "Name", ...months, "Total", "Percentage (%)"];
  const tableRows: any[] = [];

  const classStartDateObj = classStartDate ? (classStartDate.includes('-') ? parseISO(classStartDate) : new Date(classStartDate)) : new Date(startYear, 5, 1);

  sortedStudents.forEach((student, index) => {
    const rowData: any[] = [
      (index + 1).toString(),
      student.name,
    ];

    let yearlyPresentCount = 0;
    let yearlyTotalDays = 0;

    const admissionDate = student.admissionDate ? parseISO(student.admissionDate) : null;
    const studentStartDate = admissionDate && isAfter(admissionDate, classStartDateObj) ? admissionDate : classStartDateObj;

    months.forEach((monthName, monthIndex) => {
      const monthDate = new Date(monthIndex < 7 ? startYear : endYear, (monthIndex + 5) % 12, 1);
      
      let monthlyPresent = 0;
      let monthlyDays = 0;

      const daysInMonth = getDaysInMonth(monthDate);
      for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), i);
        const dateStr = format(date, 'yyyy-MM-dd');
        
        if (isBefore(date, studentStartDate) || isAfter(date, new Date())) continue;

        const holiday = holidays.find(h => h.date === dateStr);
        const isDayOff = isSunday(date) || 
                         (isSaturday(date) && (!holiday || holiday.type !== 'working_saturday')) || 
                         (holiday && holiday.type === 'holiday');

        if (!isDayOff) {
          const record = attendanceRecords.find(r => r.date === dateStr);
          if (!record) continue; // Skip if attendance not submitted for this date

          monthlyDays++;
          const studentRecord = record.records.find(r => r.studentId === student.studentId);
          if (studentRecord) {
            if (studentRecord.status === 'full_day') monthlyPresent += 1;
            else if (studentRecord.status === 'fn_only' || studentRecord.status === 'an_only') monthlyPresent += 0.5;
          }
        }
      }
      
      rowData.push(monthlyPresent.toString());
      yearlyPresentCount += monthlyPresent;
      yearlyTotalDays += monthlyDays;
    });

    rowData.push(yearlyPresentCount.toString());
    const percentage = yearlyTotalDays > 0 ? ((yearlyPresentCount / yearlyTotalDays) * 100).toFixed(1) : "0";
    const percentageNum = parseFloat(percentage);
    let textColor = [0, 0, 0];
    if (percentageNum < 50) textColor = [255, 0, 0];
    else if (percentageNum < 75) textColor = [255, 165, 0];
    rowData.push({ content: `${percentage}%`, styles: { textColor: textColor } });
    tableRows.push(rowData);
  });

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 30,
    theme: 'grid',
    styles: { fontSize: 6, cellPadding: 0.8, halign: 'center' },
    headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontSize: 6 },
    columnStyles: { 1: { halign: 'left' } },
  });

  doc.save(`Yearly_Attendance_Report_${className}_${divisionName}_${academicYear}.pdf`);
};
