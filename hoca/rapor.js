(async function () {
  const students = await (async () => {
    const c = localStorage.getItem('students');
    return c ? JSON.parse(c) : await (await fetch('../shared/students.json')).json();
  })();
  const courses = await (async () => {
    const c = localStorage.getItem('courses');
    return c ? JSON.parse(c) : await (await fetch('../shared/courses.json')).json();
  })();
  const attendance = JSON.parse(localStorage.getItem('attendance') || '{}');

  const sel = document.getElementById('courseSel');
  sel.innerHTML = courses.map(c => `<option value="${c.code}">${c.code} — ${c.name}</option>`).join('');
  sel.onchange = () => render(sel.value);
  render(courses[0].code);

  function render(courseCode) {
    const course = courses.find(c => c.code === courseCode);
    const list = students.filter(s => course.students.includes(s.no));

    let html = '<tr><th>Öğrenci</th>';
    for (let w = 1; w <= 14; w++) html += `<th>H${w}</th>`;
    html += '<th>Toplam</th></tr>';

    list.forEach(st => {
      html += `<tr><td style="text-align:left">${st.no} — ${st.ad} ${st.soyad}</td>`;
      let total = 0;
      for (let w = 1; w <= 14; w++) {
        const key = `${courseCode}_${st.no}_${w}`;
        if (attendance[key]) { html += '<td class="ok">✅</td>'; total++; }
        else html += '<td class="no">❌</td>';
      }
      html += `<td class="total">${total}</td></tr>`;
    });
    document.getElementById('report').innerHTML = html;
  }
})();