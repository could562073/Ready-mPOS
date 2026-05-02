package com.readympos.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// 每個測試方法後重建 H2 schema，確保測試互相隔離
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_EACH_TEST_METHOD)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DailyRecordControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    // 標準每日帳目測試資料
    private Map<String, Object> sampleRequest(String date) {
        return Map.of(
            "date",           date,
            "cashIncome",     "5000",
            "cardIncome",     "3000",
            "uberEatsIncome", "1500",
            "pandaIncome",    "800",
            "foodCost",       "2000",
            "staffSalary",    "3500",
            "miscExpense",    "200",
            "notes",          "測試備註"
        );
    }

    // POST 建立新紀錄 → 應回傳 201 + Location header + SYNCED 狀態
    @Test
    void postRecord_shouldReturn201() throws Exception {
        mockMvc.perform(post("/api/records")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(sampleRequest("2026-04-01"))))
            .andExpect(status().isCreated())
            .andExpect(header().string("Location", containsString("/api/records/2026-04-01")))
            .andExpect(jsonPath("$.date").value("2026-04-01"))
            .andExpect(jsonPath("$.cashIncome").value("5000"))
            .andExpect(jsonPath("$.syncStatus").value("SYNCED"))
            .andExpect(jsonPath("$.id").isNumber());
    }

    // GET 單日 → 查無紀錄應回傳 404
    @Test
    void getByDate_notFound_shouldReturn404() throws Exception {
        mockMvc.perform(get("/api/records/2026-01-01"))
            .andExpect(status().isNotFound());
    }

    // POST 後 GET 單日 → 應取得相同資料
    @Test
    void postThenGet_shouldReturnSameRecord() throws Exception {
        mockMvc.perform(post("/api/records")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(sampleRequest("2026-04-10"))))
            .andExpect(status().isCreated());

        mockMvc.perform(get("/api/records/2026-04-10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.date").value("2026-04-10"))
            .andExpect(jsonPath("$.pandaIncome").value("800"))
            .andExpect(jsonPath("$.notes").value("測試備註"));
    }

    // PUT 更新既有紀錄 → 應回傳更新後的數值
    @Test
    void putRecord_shouldUpdateValues() throws Exception {
        // 先建立一筆
        MvcResult created = mockMvc.perform(post("/api/records")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(sampleRequest("2026-04-15"))))
            .andExpect(status().isCreated())
            .andReturn();

        Long id = objectMapper.readTree(created.getResponse().getContentAsString())
            .get("id").asLong();

        // 更新金額
        Map<String, Object> updated = Map.of(
            "date",           "2026-04-15",
            "cashIncome",     "9999",
            "cardIncome",     "0",
            "uberEatsIncome", "0",
            "pandaIncome",    "0",
            "foodCost",       "0",
            "staffSalary",    "0",
            "miscExpense",    "0"
        );

        mockMvc.perform(put("/api/records/" + id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(updated)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cashIncome").value("9999"))
            .andExpect(jsonPath("$.cardIncome").value("0"))
            .andExpect(jsonPath("$.syncStatus").value("SYNCED"));
    }

    // GET 月結 → 應回傳該月所有紀錄（依日期升冪）
    @Test
    void getByMonth_shouldReturnAllRecordsInMonth() throws Exception {
        mockMvc.perform(post("/api/records")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(sampleRequest("2026-04-20"))))
            .andExpect(status().isCreated());

        mockMvc.perform(post("/api/records")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(sampleRequest("2026-04-21"))))
            .andExpect(status().isCreated());

        mockMvc.perform(get("/api/records?month=2026-04"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(2)))
            .andExpect(jsonPath("$[0].date").value("2026-04-20"))
            .andExpect(jsonPath("$[1].date").value("2026-04-21"));
    }

    // GET 月結 — 月份格式錯誤 → 應回傳 400
    @Test
    void getByMonth_invalidFormat_shouldReturn400() throws Exception {
        mockMvc.perform(get("/api/records?month=2026/05"))
            .andExpect(status().isBadRequest());
    }

    // POST 缺少必填欄位 → 應回傳 400
    @Test
    void postRecord_missingRequiredField_shouldReturn400() throws Exception {
        Map<String, Object> invalid = Map.of(
            "date", "2026-05-20"
            // 缺少所有金額欄位
        );

        mockMvc.perform(post("/api/records")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(invalid)))
            .andExpect(status().isBadRequest());
    }
}
