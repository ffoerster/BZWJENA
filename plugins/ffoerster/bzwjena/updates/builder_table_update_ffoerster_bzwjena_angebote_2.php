<?php namespace ffoerster\BZWJena\Updates;

use Schema;
use October\Rain\Database\Updates\Migration;

class BuilderTableUpdateFfoersterBzwjenaAngebote2 extends Migration
{
    public function up()
    {
        Schema::table('ffoerster_bzwjena_angebote', function($table)
        {
            $table->text('angebot_file')->nullable();
            $table->string('angebot_subtitle')->change();
        });
    }
    
    public function down()
    {
        Schema::table('ffoerster_bzwjena_angebote', function($table)
        {
            $table->dropColumn('angebot_file');
            $table->string('angebot_subtitle', 191)->change();
        });
    }
}
