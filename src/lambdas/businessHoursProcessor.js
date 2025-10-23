const https = require('https');

// Enhanced Lambda API Processor with comprehensive error handling
class LambdaApiProcessor {
  constructor(subdomain, apiToken, email) {
    this.subdomain = subdomain;
    this.apiToken = apiToken;
    this.email = email;
    this.baseUrl = `${subdomain}.zendesk.com`;
    this.requestCount = 0;
    this.maxRequests = 100; // Rate limiting
  }

  // Make HTTPS request with retry logic and rate limiting
  async makeRequest(path, method = 'GET', data = null, retries = 3) {
    // Rate limiting check
    if (this.requestCount >= this.maxRequests) {
      throw new Error(`Rate limit exceeded: ${this.maxRequests} requests`);
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.requestCount++;
        const result = await this._makeHttpsRequest(path, method, data);
        
        // Add delay between requests for rate limiting
        if (this.requestCount % 10 === 0) {
          await this._sleep(1000); // 1 second pause every 10 requests
        }
        
        return result;
      } catch (err) {
        console.log(`Request attempt ${attempt} failed for ${path}:`, err.message);
        
        if (attempt === retries) {
          throw err;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await this._sleep(delay);
      }
    }
  }

  _makeHttpsRequest(path, method, data) {
    return new Promise((resolve, reject) => {
      const authString = Buffer.from(`${this.email}/token:${this.apiToken}`).toString('base64');
      const options = {
        hostname: this.baseUrl,
        path: path,
        method: method,
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
          'User-Agent': 'BusinessHoursLambda/1.0'
        },
        timeout: 30000 // 30 second timeout
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const jsonBody = body ? JSON.parse(body) : {};
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(jsonBody);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${jsonBody.error || jsonBody.description || body}`));
            }
          } catch (parseErr) {
            reject(new Error(`Parse Error: ${parseErr.message} - Body: ${body.substring(0, 200)}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Request Error: ${err.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout (30s)'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Main processing function optimized for Lambda
  async processBusinessHours() {
    const startTime = Date.now();
    console.log('🚀 Lambda: Starting business hours processing...');
    console.log(`🔗 Target: https://${this.baseUrl}`);
    console.log(`⏰ Execution time: ${new Date().toISOString()}`);
    
    try {
      // Step 1: Find Zendesk Team group
      console.log('🔍 Finding Zendesk Team group...');
      const zendeskTeamGroup = await this.findZendeskTeamGroup();
      
      if (!zendeskTeamGroup) {
        throw new Error('Zendesk Team group not found');
      }
      
      console.log(`✓ Found Zendesk Team group: ${zendeskTeamGroup.id} (${zendeskTeamGroup.name})`);

      // Step 2: Load ticket fields for custom field detection
      console.log('📋 Loading ticket fields...');
      const ticketFields = await this.loadTicketFields();
      const ticketSourceField = ticketFields.find(field => 
        field.title && field.title.toLowerCase() === 'ticket source'
      );
      
      console.log(`✓ Loaded ${ticketFields.length} ticket fields`);
      if (ticketSourceField) {
        console.log(`✓ Found Ticket Source field: ID ${ticketSourceField.id}`);
      }

      // Step 3: Find New tickets assigned to Zendesk Team
      console.log('🎫 Searching for New tickets assigned to Zendesk Team...');
      const tickets = await this.findZendeskTeamTickets(zendeskTeamGroup.id);
      console.log(`🎫 Found ${tickets.length} Zendesk Team tickets to process`);

      if (tickets.length === 0) {
        console.log('ℹ️ No tickets to process');
        return {
          success: true,
          processed: 0,
          results: [],
          groupId: zendeskTeamGroup.id,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          requestCount: this.requestCount
        };
      }

      // Step 4: Process each ticket with batching for Lambda efficiency
      console.log('⚙️ Processing tickets...');
      const results = [];
      const batchSize = 5; // Process in small batches to avoid timeout
      
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tickets.length/batchSize)} (${batch.length} tickets)`);
        
        // Process batch in parallel for efficiency
        const batchPromises = batch.map(ticket => this.processTicket(ticket, ticketSourceField));
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, index) => {
          const ticket = batch[index];
          if (result.status === 'fulfilled') {
            results.push(result.value);
            console.log(`✅ Processed ticket ${ticket.id}: ${result.value.action}`);
          } else {
            console.error(`❌ Failed to process ticket ${ticket.id}:`, result.reason.message);
            results.push({
              id: ticket.id,
              subject: ticket.subject || 'Unknown',
              action: `Error: ${result.reason.message}`,
              status: 'Error'
            });
          }
        });
        
        // Small delay between batches
        if (i + batchSize < tickets.length) {
          await this._sleep(500); // 500ms between batches
        }
      }

      const summary = {
        success: true,
        processed: results.length,
        results,
        groupId: zendeskTeamGroup.id,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        requestCount: this.requestCount,
        summary: {
          inHours: results.filter(r => r.status === 'In Hours').length,
          outOfHours: results.filter(r => r.status === 'Out of Hours').length,
          errors: results.filter(r => r.status === 'Error').length,
          overrides: results.filter(r => r.overrideReason).length,
          updated: results.filter(r => r.action.includes('Updated')).length,
          noChange: results.filter(r => r.action.includes('No change')).length
        }
      };

      console.log(`🎉 Lambda processing complete!`);
      console.log(`📊 Summary: ${summary.summary.inHours} in hours, ${summary.summary.outOfHours} out of hours`);
      console.log(`📊 Actions: ${summary.summary.updated} updated, ${summary.summary.noChange} no change, ${summary.summary.errors} errors`);
      console.log(`⏱️ Duration: ${summary.duration}ms, Requests: ${summary.requestCount}`);
      
      return summary;

    } catch (err) {
      const duration = Date.now() - startTime;
      console.error('❌ Lambda processing failed:', err.message);
      console.error('📊 Execution stats:', { duration, requestCount: this.requestCount });
      
      return {
        success: false,
        error: err.message,
        processed: 0,
        results: [],
        duration,
        timestamp: new Date().toISOString(),
        requestCount: this.requestCount
      };
    }
  }

  // Find Zendesk Team group using multiple methods
  async findZendeskTeamGroup() {
    try {
      // Method 1: Direct groups API
      const data = await this.makeRequest('/api/v2/groups.json');
      const zendeskTeamGroup = data.groups.find(group => 
        group.name && group.name.toLowerCase().trim() === 'zendesk team'
      );
      
      if (zendeskTeamGroup) {
        return zendeskTeamGroup;
      }

      // Method 2: Search API fallback
      const query = encodeURIComponent('type:group "Zendesk Team"');
      const searchData = await this.makeRequest(`/api/v2/search.json?query=${query}`);
      return searchData.results.find(group => 
        group.name && group.name.toLowerCase().trim() === 'zendesk team'
      );
    } catch (err) {
      console.error('Error finding Zendesk Team group:', err.message);
      throw err;
    }
  }

  // Load all ticket fields for custom field detection
  async loadTicketFields() {
    try {
      const data = await this.makeRequest('/api/v2/ticket_fields.json');
      return data.ticket_fields || [];
    } catch (err) {
      console.error('Error loading ticket fields:', err.message);
      throw err;
    }
  }

  // Find New tickets assigned to Zendesk Team group
  async findZendeskTeamTickets(groupId) {
    try {
      const query = encodeURIComponent(`type:ticket status:new group_id:${groupId}`);
      const data = await this.makeRequest(`/api/v2/search.json?query=${query}&per_page=100`);
      return data.results || [];
    } catch (err) {
      console.error('Error finding Zendesk Team tickets:', err.message);
      throw err;
    }
  }

  // Process individual ticket with comprehensive logic
  async processTicket(ticket, ticketSourceField) {
    // Get detailed ticket information
    const ticketData = await this.makeRequest(`/api/v2/tickets/${ticket.id}.json`);
    const fullTicket = ticketData.ticket;

    // Check for override conditions
    let isInHours = false;
    let overrideReason = null;

    // Priority override: Urgent tickets are always in hours
    if (fullTicket.priority && fullTicket.priority.toLowerCase() === 'urgent') {
      isInHours = true;
      overrideReason = 'Priority: Urgent';
    }

    // Ticket Source override: System Alert tickets are always in hours
    if (!overrideReason && ticketSourceField && fullTicket.custom_fields) {
      const ticketSourceValue = fullTicket.custom_fields.find(cf => 
        cf.id === ticketSourceField.id
      )?.value;
      
      if (ticketSourceValue && ticketSourceValue.toLowerCase() === 'system alert') {
        isInHours = true;
        overrideReason = 'Ticket Source: System Alert';
      }
    }

    // Schedule evaluation if no override
    let scheduleInfo = { schedule: '24/7', timezone: 'UTC', source: 'Default' };
    if (!overrideReason) {
      scheduleInfo = this.getScheduleFromTicketTags(fullTicket.tags || []);
      isInHours = this.checkBusinessHours(scheduleInfo.schedule, scheduleInfo.timezone);
    }

    // Update tags if needed
    const currentTags = fullTicket.tags || [];
    const updatedTags = this.updateTicketTags(currentTags, isInHours);

    let actionText = '';
    if (JSON.stringify(updatedTags) !== JSON.stringify(currentTags)) {
      // Update ticket tags
      await this.makeRequest(`/api/v2/tickets/${ticket.id}.json`, 'PUT', {
        ticket: { tags: updatedTags }
      });

      actionText = overrideReason ? 
        `Updated tags: added "${isInHours ? 'inhours' : 'outofhours'}" (${overrideReason})` : 
        `Updated tags: added "${isInHours ? 'inhours' : 'outofhours'}"`;
    } else {
      actionText = overrideReason ? 
        `No change needed (${overrideReason})` : 
        'No change needed';
    }

    return {
      id: ticket.id,
      subject: ticket.subject,
      action: actionText,
      overrideReason,
      status: isInHours ? 'In Hours' : 'Out of Hours',
      schedule: overrideReason ? 'Always In Hours' : `${scheduleInfo.schedule} (${scheduleInfo.timezone})`,
      ruleSource: overrideReason ? 'Override Rule' : scheduleInfo.source
    };
  }

  // Extract schedule from ticket tags
  getScheduleFromTicketTags(ticketTags) {
    const scheduleTagMappings = {
      '18_x_5__et_': {
        schedule: 'Mon-Fri 6-24',
        timezone: 'ET',
        source: 'Ticket Tag: 18_x_5__et_',
        description: 'Monday-Friday, 6AM-12AM Eastern Time'
      },
      '18_x_5__cet_': {
        schedule: 'Mon-Fri 6-24',
        timezone: 'CET',
        source: 'Ticket Tag: 18_x_5__cet_',
        description: 'Monday-Friday, 6AM-12AM Central European Time'
      },
      '18_x_5__jst_': {
        schedule: 'Mon-Fri 6-24',
        timezone: 'JST',
        source: 'Ticket Tag: 18_x_5__jst_',
        description: 'Monday-Friday, 6AM-12AM Japan Standard Time'
      },
      '24_x_5_et_': {
        schedule: 'Mon-Fri 0-24',
        timezone: 'ET',
        source: 'Ticket Tag: 24_x_5_et_',
        description: '24 hours Monday-Friday Eastern Time'
      },
      '24_x_5_cet_': {
        schedule: 'Mon-Fri 0-24',
        timezone: 'CET',
        source: 'Ticket Tag: 24_x_5_cet_',
        description: '24 hours Monday-Friday Central European Time'
      },
      '24_x_5_jst_': {
        schedule: 'Mon-Fri 0-24',
        timezone: 'JST',
        source: 'Ticket Tag: 24_x_5_jst_',
        description: '24 hours Monday-Friday Japan Standard Time'
      }
    };

    // Check for schedule tags
    for (const tag of ticketTags) {
      if (scheduleTagMappings[tag]) {
        return scheduleTagMappings[tag];
      }
    }

    // Default to 24/7 if no schedule tags found
    return {
      schedule: '24/7',
      timezone: 'UTC',
      source: 'Default (No Schedule Tags)',
      description: '24/7 coverage (no schedule tags present)'
    };
  }

  // Check if current time is within business hours with timezone support
  checkBusinessHours(scheduleValue, timezone = 'UTC') {
    if (scheduleValue === '24/7') return true;

    const now = new Date();
    const timezoneOffset = this.getTimezoneOffset(timezone);
    const localTime = new Date(now.getTime() + (timezoneOffset * 60 * 60 * 1000));
    
    const localHour = localTime.getHours();
    const localDay = localTime.getDay();

    // Parse schedule
    let workDays = [1, 2, 3, 4, 5]; // Default Mon-Fri
    let startHour = 9;
    let endHour = 17;

    const scheduleStr = scheduleValue.toLowerCase();
    
    if (scheduleStr.includes('mon-fri')) {
      workDays = [1, 2, 3, 4, 5];
    }

    const hourMatch = scheduleStr.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
    if (hourMatch) {
      startHour = parseInt(hourMatch[1]);
      endHour = parseInt(hourMatch[2]);
    }

    const isWorkDay = workDays.includes(localDay);
    let isWorkHour = false;

    if (endHour === 24) {
      isWorkHour = localHour >= startHour && localHour < 24;
    } else if (startHour === 0 && endHour === 24) {
      isWorkHour = true;
    } else {
      isWorkHour = localHour >= startHour && localHour < endHour;
    }

    return isWorkDay && isWorkHour;
  }

  // Get timezone offset with DST handling
  getTimezoneOffset(timezone) {
    const now = new Date();
    const currentMonth = now.getUTCMonth();
    
    const timezoneOffsets = {
      'UTC': 0, 'GMT': 0, 'JST': 9,
      'EST': -5, 'EDT': -4, 'PST': -8, 'PDT': -7,
      'MST': -7, 'MDT': -6, 'CST': -6, 'CDT': -5,
      'CET': 1, 'CEST': 2
    };
    
    // Handle DST for ET and CET
    if (timezone === 'ET') {
      return (currentMonth >= 2 && currentMonth <= 10) ? -4 : -5; // EDT vs EST
    }
    if (timezone === 'CET') {
      return (currentMonth >= 2 && currentMonth <= 9) ? 2 : 1; // CEST vs CET
    }
    
    return timezoneOffsets[timezone] || 0;
  }

  // Update ticket tags with business hours status
  updateTicketTags(currentTags, isInHours) {
    let tags = [...currentTags];
    tags = tags.filter(tag => tag !== 'inhours' && tag !== 'outofhours');
    tags.push(isInHours ? 'inhours' : 'outofhours');
    return tags;
  }
}

// AWS Lambda Handler
exports.handler = async (event, context) => {
  // Set Lambda context for better logging
  console.log('🚀 AWS Lambda triggered for business hours processing');
  console.log('📋 Event:', JSON.stringify(event, null, 2));
  console.log('📋 Context:', JSON.stringify({
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    memoryLimitInMB: context.memoryLimitInMB,
    remainingTimeInMillis: context.getRemainingTimeInMillis()
  }, null, 2));

  // Get credentials from environment variables
  const apiToken  = process.env.apiToken;
  const subdomain = process.env.subdomain;
  const email = process.env.email;
  console.log(apiToken);
  console.log(subdomain);
  console.log(email);

  // Validate environment variables
  if (!subdomain || !apiToken || !email) {
    const error = 'Missing required environment variables: ZENDESK_SUBDOMAIN, ZENDESK_API_TOKEN, ZENDESK_EMAIL';
    console.error('❌', error);
    
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: error,
        timestamp: new Date().toISOString()
      })
    };
  }

  try {
    // Create processor and run business hours processing
    const processor = new LambdaApiProcessor(subdomain, apiToken, email);
    const result = await processor.processBusinessHours();

    console.log('✅ Lambda processing completed:', {
      success: result.success,
      processed: result.processed,
      duration: result.duration,
      requestCount: result.requestCount
    });

    // Return success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Business hours processing completed successfully',
        ...result
      })
    };

  } catch (error) {
    console.error('❌ Lambda execution failed:', error);

    // Return error response
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};