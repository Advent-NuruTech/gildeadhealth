export const FORM_MAX_BYTES = 20 * 1024 * 1024;

export const BUILT_IN_FORMS = [
  {
    id: "work-contract",
    title: "Work Contract",
    description: "Download, complete, and submit the work contract.",
    fileName: "Document (7) WORK CONTRACT (1).docx",
  },
  {
    id: "patient-admission",
    title: "Patient's Admission Form",
    description: "Download, complete, and submit a patient's admission form.",
    fileName: "Document (8) PATIENT'S ADMISSION FORM.docx",
  },
  {
    id: "home-admission",
    title: "Home Admission",
    description: "Download, complete, and submit the home admission form.",
    fileName: "Document (9) HOME ADMISSION.docx",
  },
  {
    id: "students-declaration",
    title: "Students Declaration Form",
    description: "Download, complete, and submit the students declaration form.",
    fileName: "Document STUDENTS DECLARATION FORM.docx",
  },
] as const;

export type FormTemplate = {
  id: string;
  title: string;
  description: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  enabled: boolean;
  isBundled: boolean;
  updatedAt?: unknown;
};

export type FormSubmission = {
  id: string;
  formId: string;
  formTitle: string;
  fileName: string;
  fileType: string;
  createdAt?: unknown;
};
