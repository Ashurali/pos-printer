# app/models/printer_setting.rb
class PrinterSetting < ApplicationRecord
  belongs_to :user, optional: true

  PAPER_WIDTHS = %w[58mm 80mm].freeze
  DRAWER_PINS  = [2, 5].freeze

  validates :paper_width, inclusion: { in: PAPER_WIDTHS }
  validates :cash_drawer_pin, inclusion: { in: DRAWER_PINS }
  validates :chunk_size, numericality: { greater_than: 0, less_than_or_equal_to: 4096 }
  validates :chunk_delay, numericality: { greater_than_or_equal_to: 0 }

  # Returns the config as a hash suitable for JS PrinterManager options.
  def to_js_config
    {
      paperWidth:           paper_width,
      chunkSize:            chunk_size,
      chunkDelay:           chunk_delay,
      autoReconnect:        auto_reconnect,
      savedDeviceName:      device_name,
      savedDeviceId:        device_id,
      cashDrawerPin:        cash_drawer_pin,
    }
  end

  # Find or initialize a default setting for the given user (or global).
  def self.for_user(user = nil)
    if user
      find_or_initialize_by(user: user)
    else
      first_or_initialize
    end
  end
end
