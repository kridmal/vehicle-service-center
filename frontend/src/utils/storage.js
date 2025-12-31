const JOB_CARDS_KEY = "ksc_job_cards";

export const getJobCards = () => {
  return JSON.parse(localStorage.getItem(JOB_CARDS_KEY) || "[]");
};

export const saveJobCards = (jobCards) => {
  localStorage.setItem(JOB_CARDS_KEY, JSON.stringify(jobCards));
};
