import React, { useState } from 'react';
import { Student, Class, Division, ClassHistory } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { X, Plus, Trash2 } from 'lucide-react';

interface EditStudentModalProps {
  student: Student;
  classes: Class[];
  divisions: Division[];
  onClose: () => void;
  onSave: () => void;
}

export const EditStudentModal: React.FC<EditStudentModalProps> = ({ student, classes, divisions, onClose, onSave }) => {
  const [name, setName] = useState(student.name);
  const [admissionNumber, setAdmissionNumber] = useState(student.admissionNumber);
  const [classHistory, setClassHistory] = useState<ClassHistory[]>(student.classHistory || []);

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, 'students', student.studentId), {
        name,
        admissionNumber,
        classHistory
      });
      onSave();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Failed to update student.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-in zoom-in duration-200">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Student</h3>
        
        <div className="space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl"
          />
          <input
            value={admissionNumber}
            onChange={(e) => setAdmissionNumber(e.target.value)}
            placeholder="Admission Number"
            className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl"
          />

          <h4 className="font-bold text-gray-900 mt-4">Class History</h4>
          {classHistory.map((history, index) => (
            <div key={index} className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
              <select
                value={history.classId}
                onChange={(e) => {
                  const newHistory = [...classHistory];
                  newHistory[index].classId = e.target.value;
                  setClassHistory(newHistory);
                }}
                className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded-lg"
              >
                {classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}
              </select>
              <select
                value={history.divisionId}
                onChange={(e) => {
                  const newHistory = [...classHistory];
                  newHistory[index].divisionId = e.target.value;
                  setClassHistory(newHistory);
                }}
                className="flex-1 px-2 py-1 bg-white border border-gray-200 rounded-lg"
              >
                {divisions.filter(d => d.classId === history.classId).map(d => <option key={d.divisionId} value={d.divisionId}>{d.name}</option>)}
              </select>
              <input type="date" value={history.startDate} onChange={e => {
                const newHistory = [...classHistory];
                newHistory[index].startDate = e.target.value;
                setClassHistory(newHistory);
              }} className="px-2 py-1 bg-white border border-gray-200 rounded-lg" />
              <button onClick={() => setClassHistory(classHistory.filter((_, i) => i !== index))} className="text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setClassHistory([...classHistory, { classId: classes[0]?.classId, divisionId: divisions[0]?.divisionId, startDate: new Date().toISOString().split('T')[0] }])} className="text-sm text-blue-600 flex items-center gap-1"><Plus className="h-4 w-4" /> Add History</button>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100">Cancel</button>
          <button onClick={handleSave} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600">Save</button>
        </div>
      </div>
    </div>
  );
};
